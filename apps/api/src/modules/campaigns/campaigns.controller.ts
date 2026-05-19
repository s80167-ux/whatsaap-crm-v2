import type { Request, Response } from "express";
import { z } from "zod";
import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";
import { ContactService } from "../../services/contactService.js";
import { ConnectorClient } from "../../services/connectorClient.js";
import { ConversationService } from "../../services/conversationService.js";
import { SendMessageService } from "../../services/sendMessageService.js";
import { normalizePhoneNumber } from "../../utils/phone.js";

const contactService = new ContactService();
const connectorClient = new ConnectorClient();
const conversationService = new ConversationService();
const sendMessageService = new SendMessageService();

const audienceGroupParamsSchema = z.object({
  audienceGroupId: z.string().uuid()
});

const campaignParamsSchema = z.object({
  campaignId: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const createAudienceGroupBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  totalRows: z.number().int().min(0).optional(),
  validCount: z.number().int().min(0).optional(),
  invalidCount: z.number().int().min(0).optional(),
  duplicateCount: z.number().int().min(0).optional(),
  optOutCount: z.number().int().min(0).optional(),
  linkedCrmCount: z.number().int().min(0).optional()
});

const audienceContactSchema = z.object({
  name: z.string().optional().nullable(),
  phone_raw: z.string().min(1),
  phone_normalized: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "unknown"]).default("unknown"),
  tag: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  product_interest: z.string().optional().nullable(),
  customer_type: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  validation_status: z.enum(["valid", "invalid"]).default("valid"),
  validation_issues: z.array(z.string()).default([]),
  is_duplicate: z.boolean().default(false),
  is_opted_out: z.boolean().default(false),
  crm_contact_id: z.string().uuid().optional().nullable()
});

const importAudienceContactsBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  contacts: z.array(audienceContactSchema),
  addValidNewContactsToCrm: z.boolean().default(false)
});

const tempoSchema = z.object({
  speedPreset: z.enum(["safe", "normal", "custom"]).default("safe"),
  delayPerMessageSeconds: z.number().int().positive().default(12),
  batchSize: z.number().int().positive().default(20),
  batchPauseSeconds: z.number().int().positive().default(120),
  dailyLimit: z.number().int().positive().default(300),
  stopOnHighFailure: z.boolean().default(true)
});

const senderModeSchema = z.enum(["single", "round_robin"]);
const senderPoolSchema = z.array(z.string().uuid()).min(1).max(32);

const createCampaignBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  senderWhatsAppAccountId: z.string().uuid().optional(),
  senderWhatsAppAccountIds: senderPoolSchema.optional(),
  senderMode: senderModeSchema.optional(),
  audienceGroupId: z.string().uuid(),
  messageTemplate: z.string().trim().min(1).max(5000),
  tempo: tempoSchema
});

const updateCampaignBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160).optional(),
  senderWhatsAppAccountId: z.string().uuid().optional(),
  senderWhatsAppAccountIds: senderPoolSchema.optional(),
  senderMode: senderModeSchema.optional(),
  audienceGroupId: z.string().uuid().optional(),
  messageTemplate: z.string().trim().min(1).max(5000).optional(),
  tempo: tempoSchema.optional()
});

const sendTestBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  senderWhatsAppAccountId: z.string().uuid(),
  testPhoneNumber: z.string().trim().min(6),
  messageTemplate: z.string().trim().min(1)
});

const startCampaignBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  senderWhatsAppAccountId: z.string().uuid().optional(),
  senderWhatsAppAccountIds: senderPoolSchema.optional(),
  senderMode: senderModeSchema.optional(),
  audienceGroupId: z.string().uuid(),
  messageTemplate: z.string().trim().min(1),
  speedPreset: z.enum(["safe", "normal", "custom"]).default("safe")
});

const campaignActionBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable()
});

const campaignRecipientsQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  status: z.enum(["pending", "queued", "sent", "failed", "skipped"]).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(250).default(50)
});

type AudienceGroupRecord = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  source: string;
  status: string;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  opt_out_count: number;
  linked_crm_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignRecord = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  audience_group_id: string | null;
  sender_mode: "single" | "round_robin";
  sender_whatsapp_account_id: string | null;
  message_template: string | null;
  speed_preset: string;
  delay_per_message_seconds: number;
  batch_size: number;
  batch_pause_seconds: number;
  daily_limit: number;
  stop_on_high_failure: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignSummaryRecord = CampaignRecord & {
  audience_group_name: string | null;
  audience_valid_count: number | null;
  sender_whatsapp_account_ids: string[] | null;
  sender_whatsapp_label: string | null;
  sender_phone_number: string | null;
  recipients: string;
  pending: string;
  queued: string;
  sent: string;
  failed: string;
  skipped: string;
  replied: string;
};

type CampaignAudienceContactRecord = {
  id: string;
  crm_contact_id: string | null;
  name: string | null;
  phone_normalized: string;
  gender: "male" | "female" | "unknown";
  salutation: string | null;
  tag: string | null;
  location: string | null;
  product_interest: string | null;
  customer_type: string | null;
  notes: string | null;
};

type CampaignRecipientRecord = {
  id: string;
  campaign_id: string;
  audience_group_contact_id: string | null;
  crm_contact_id: string | null;
  name: string | null;
  phone_normalized: string;
  gender: "male" | "female" | "unknown";
  salutation: string | null;
  tag: string | null;
  location: string | null;
  product_interest: string | null;
  customer_type: string | null;
  notes: string | null;
  send_status: "pending" | "queued" | "sent" | "failed" | "skipped";
  message_id: string | null;
  attempt_count: number;
  queued_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  next_attempt_at: string | null;
  error_message: string | null;
  created_at: string;
  total_count: string;
};

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function resolveOrganizationId(request: Request, inputOrganizationId?: string | null) {
  const auth = requireAuth(request);

  if (auth.role === "super_admin") {
    const queryInput = organizationQuerySchema.parse(request.query);
    const organizationId = inputOrganizationId ?? queryInput.organization_id ?? null;

    if (!organizationId) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    return organizationId;
  }

  if (!auth.organizationId) {
    throw new AppError("Organization context is missing for this user", 403, "organization_required");
  }

  return auth.organizationId;
}

export async function listAudienceGroups(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const result = await query<AudienceGroupRecord>(
    `
      select *
      from campaign_audience_groups
      where organization_id = $1
      order by created_at desc, name asc
    `,
    [organizationId]
  );

  return response.json({ data: result.rows });
}

export async function listCampaigns(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const result = await listCampaignSummaries(organizationId);

  return response.json({ data: result });
}

export async function createCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const senderSelection = resolveSenderSelection(input);

  await assertConnectedSenders(organizationId, senderSelection.senderWhatsAppAccountIds);
  await assertReadyAudienceGroup(organizationId, input.audienceGroupId);

  const result = await withTransaction(async (client) => {
    const inserted = await client.query<CampaignRecord>(
      `
        insert into campaigns (
          organization_id,
          name,
          status,
          audience_group_id,
          sender_mode,
          sender_whatsapp_account_id,
          message_template,
          speed_preset,
          delay_per_message_seconds,
          batch_size,
          batch_pause_seconds,
          daily_limit,
          stop_on_high_failure,
          created_by
        )
        values ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        returning *
      `,
      [
        organizationId,
        input.name,
        input.audienceGroupId,
        senderSelection.senderMode,
        senderSelection.primarySenderWhatsAppAccountId,
        input.messageTemplate,
        input.tempo.speedPreset,
        input.tempo.delayPerMessageSeconds,
        input.tempo.batchSize,
        input.tempo.batchPauseSeconds,
        input.tempo.dailyLimit,
        input.tempo.stopOnHighFailure,
        auth.organizationUserId
      ]
    );

    const campaign = inserted.rows[0];

    await syncCampaignSenderAccounts(client, {
      organizationId,
      campaignId: campaign.id,
      senderWhatsAppAccountIds: senderSelection.senderWhatsAppAccountIds
    });

    return campaign;
  });

  return response.status(201).json({ data: result });
}

export async function getCampaign(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const campaign = await getCampaignSummary(organizationId, campaignId);

  if (!campaign) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  return response.json({ data: campaign });
}

export async function listCampaignRecipients(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = campaignRecipientsQuerySchema.parse(request.query);
  const organizationId = resolveOrganizationId(request);
  await assertCampaignExists(organizationId, campaignId);

  const offset = (input.page - 1) * input.limit;
  const values: unknown[] = [organizationId, campaignId];
  const filters = [
    "cr.organization_id = $1",
    "cr.campaign_id = $2"
  ];

  if (input.status) {
    values.push(input.status);
    filters.push(`cr.send_status = $${values.length}`);
  }

  if (input.q) {
    values.push(`%${input.q}%`);
    filters.push(`(
      cr.name ilike $${values.length}
      or cr.phone_normalized ilike $${values.length}
      or cr.tag ilike $${values.length}
      or cr.location ilike $${values.length}
      or cr.customer_type ilike $${values.length}
      or cr.error_message ilike $${values.length}
    )`);
  }

  values.push(input.limit, offset);
  const result = await query<CampaignRecipientRecord>(
    `
      select
        cr.*,
        count(*) over()::text as total_count
      from campaign_recipients cr
      where ${filters.join(" and ")}
      order by
        case cr.send_status
          when 'failed' then 1
          when 'queued' then 2
          when 'pending' then 3
          when 'sent' then 4
          when 'skipped' then 5
          else 6
        end,
        coalesce(cr.failed_at, cr.sent_at, cr.queued_at, cr.created_at) desc,
        cr.created_at asc
      limit $${values.length - 1}
      offset $${values.length}
    `,
    values
  );

  return response.json({
    data: result.rows.map(toCampaignRecipient),
    pagination: {
      page: input.page,
      limit: input.limit,
      total: Number(result.rows[0]?.total_count ?? 0)
    }
  });
}

export async function exportCampaignRecipients(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = campaignRecipientsQuerySchema.parse({ ...request.query, page: 1, limit: 250 });
  const organizationId = resolveOrganizationId(request);
  const campaign = await findCampaign(organizationId, campaignId);

  if (!campaign) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  const values: unknown[] = [organizationId, campaignId];
  const filters = [
    "cr.organization_id = $1",
    "cr.campaign_id = $2"
  ];

  if (input.status) {
    values.push(input.status);
    filters.push(`cr.send_status = $${values.length}`);
  }

  if (input.q) {
    values.push(`%${input.q}%`);
    filters.push(`(
      cr.name ilike $${values.length}
      or cr.phone_normalized ilike $${values.length}
      or cr.tag ilike $${values.length}
      or cr.location ilike $${values.length}
      or cr.customer_type ilike $${values.length}
      or cr.error_message ilike $${values.length}
    )`);
  }

  const result = await query<CampaignRecipientRecord>(
    `
      select cr.*, count(*) over()::text as total_count
      from campaign_recipients cr
      where ${filters.join(" and ")}
      order by cr.created_at asc
    `,
    values
  );

  const headers = [
    "Campaign Name",
    "Contact Name",
    "Phone Number",
    "Gender",
    "Salutation",
    "Tag",
    "Location",
    "Product Interest",
    "Customer Type",
    "Send Status",
    "Attempt Count",
    "Queued At",
    "Sent At",
    "Failed At",
    "Next Attempt At",
    "Error Message",
    "Message ID",
    "Notes"
  ];

  const csv = toCsv([
    headers,
    ...result.rows.map((recipient) => [
      campaign.name,
      recipient.name ?? "",
      recipient.phone_normalized,
      recipient.gender,
      recipient.salutation ?? "",
      recipient.tag ?? "",
      recipient.location ?? "",
      recipient.product_interest ?? "",
      recipient.customer_type ?? "",
      recipient.send_status,
      String(recipient.attempt_count),
      recipient.queued_at ?? "",
      recipient.sent_at ?? "",
      recipient.failed_at ?? "",
      recipient.next_attempt_at ?? "",
      recipient.error_message ?? "",
      recipient.message_id ?? "",
      recipient.notes ?? ""
    ])
  ]);

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${toSafeFilename(campaign.name)}-recipients.csv"`);
  return response.send(`\uFEFF${csv}`);
}

export async function updateCampaign(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = updateCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const existing = await findCampaign(organizationId, campaignId);

  if (!existing) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  const hasSenderSelectionInput =
    Boolean(input.senderWhatsAppAccountId) ||
    Boolean(input.senderWhatsAppAccountIds?.length) ||
    Boolean(input.senderMode);

  const senderSelection = hasSenderSelectionInput
    ? resolveSenderSelection(input, existing.sender_whatsapp_account_id)
    : null;

  if (senderSelection) {
    await assertConnectedSenders(organizationId, senderSelection.senderWhatsAppAccountIds);
  }

  if (input.audienceGroupId) {
    await assertReadyAudienceGroup(organizationId, input.audienceGroupId);
  }

  const nextTempo = input.tempo;
  const result = await withTransaction(async (client) => {
    const updated = await client.query<CampaignRecord>(
      `
        update campaigns
        set name = coalesce($3, name),
            audience_group_id = coalesce($4, audience_group_id),
            sender_mode = coalesce($5, sender_mode),
            sender_whatsapp_account_id = coalesce($6, sender_whatsapp_account_id),
            message_template = coalesce($7, message_template),
            speed_preset = coalesce($8, speed_preset),
            delay_per_message_seconds = coalesce($9, delay_per_message_seconds),
            batch_size = coalesce($10, batch_size),
            batch_pause_seconds = coalesce($11, batch_pause_seconds),
            daily_limit = coalesce($12, daily_limit),
            stop_on_high_failure = coalesce($13, stop_on_high_failure),
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
        returning *
      `,
      [
        organizationId,
        campaignId,
        input.name ?? null,
        input.audienceGroupId ?? null,
        senderSelection?.senderMode ?? null,
        senderSelection?.primarySenderWhatsAppAccountId ?? null,
        input.messageTemplate ?? null,
        nextTempo?.speedPreset ?? null,
        nextTempo?.delayPerMessageSeconds ?? null,
        nextTempo?.batchSize ?? null,
        nextTempo?.batchPauseSeconds ?? null,
        nextTempo?.dailyLimit ?? null,
        nextTempo?.stopOnHighFailure ?? null
      ]
    );

    if (senderSelection) {
      await syncCampaignSenderAccounts(client, {
        organizationId,
        campaignId,
        senderWhatsAppAccountIds: senderSelection.senderWhatsAppAccountIds
      });
    }

    return updated.rows[0];
  });

  return response.json({ data: result });
}

export async function deleteCampaign(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const existing = await findCampaign(organizationId, campaignId);

  if (!existing) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        delete from message_dispatch_outbox
        where organization_id = $1
          and processing_status in ('pending', 'failed')
          and payload->>'source' = 'campaign'
          and payload->'campaign'->>'campaignId' = $2
      `,
      [organizationId, campaignId]
    );

    await client.query(
      `
        delete from campaigns
        where organization_id = $1
          and id = $2
      `,
      [organizationId, campaignId]
    );
  });

  return response.json({
    ok: true,
    message: `Campaign "${existing.name}" deleted.`
  });
}

export async function sendCampaignTestPreview(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = sendTestBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  const message = await sendCampaignTestMessage({
    organizationId,
    organizationUserId: auth.organizationUserId,
    senderWhatsAppAccountId: input.senderWhatsAppAccountId,
    testPhoneNumber: input.testPhoneNumber,
    messageTemplate: input.messageTemplate
  });

  return response.json({
    data: {
      ok: true,
      message: `Test message sent to ${input.testPhoneNumber}.`,
      messageId: message.id
    }
  });
}

export async function sendCampaignTest(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = sendTestBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  await assertCampaignExists(organizationId, campaignId);
  await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  const message = await sendCampaignTestMessage({
    organizationId,
    organizationUserId: auth.organizationUserId,
    senderWhatsAppAccountId: input.senderWhatsAppAccountId,
    testPhoneNumber: input.testPhoneNumber,
    messageTemplate: input.messageTemplate
  });

  return response.json({
    data: {
      ok: true,
      message: `Test message sent to ${input.testPhoneNumber}.`,
      messageId: message.id
    }
  });
}

export async function startCampaignPreview(request: Request, response: Response) {
  const input = startCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const senderSelection = resolveSenderSelection(input);
  await assertConnectedSenders(organizationId, senderSelection.senderWhatsAppAccountIds);
  await assertReadyAudienceGroup(organizationId, input.audienceGroupId);
  return response.json({
    data: {
      ok: true,
      message: `Campaign queued using ${senderSelection.senderWhatsAppAccountIds.length} sender${senderSelection.senderWhatsAppAccountIds.length === 1 ? "" : "s"} for ${input.audienceGroupId} with ${input.speedPreset} tempo.`
    }
  });
}

export async function startCampaign(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = startCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const campaign = await findCampaign(organizationId, campaignId);

  if (!campaign) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  const senderSelection = resolveSenderSelection(input, campaign.sender_whatsapp_account_id);

  if (!["draft", "scheduled", "failed"].includes(campaign.status)) {
    throw new AppError("Only draft, scheduled or failed campaigns can be started", 409, "campaign_not_startable", {
      status: campaign.status
    });
  }

  await assertConnectedSenders(organizationId, senderSelection.senderWhatsAppAccountIds);
  await assertReadyAudienceGroup(organizationId, input.audienceGroupId);

  const snapshot = await snapshotCampaignRecipients({
    organizationId,
    campaignId,
    audienceGroupId: input.audienceGroupId
  });

  if (snapshot.length === 0) {
    throw new AppError("Audience Group has no valid recipients to send", 400, "campaign_no_valid_recipients");
  }

  const result = await withTransaction(async (client) => {
    const updated = await client.query<CampaignRecord>(
      `
        update campaigns
        set status = 'sending',
            sender_mode = $3,
            sender_whatsapp_account_id = $4,
            audience_group_id = $5,
            message_template = $6,
            speed_preset = $7,
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
        returning *
      `,
      [
        organizationId,
        campaignId,
        senderSelection.senderMode,
        senderSelection.primarySenderWhatsAppAccountId,
        input.audienceGroupId,
        input.messageTemplate,
        input.speedPreset
      ]
    );

    await syncCampaignSenderAccounts(client, {
      organizationId,
      campaignId,
      senderWhatsAppAccountIds: senderSelection.senderWhatsAppAccountIds
    });

    return updated.rows[0];
  });

  return response.json({
    data: {
      ok: true,
      message: `Campaign started. ${snapshot.length} recipient${snapshot.length === 1 ? "" : "s"} scheduled for paced dispatch.`,
      campaign: result,
      scheduled: snapshot.length
    }
  });
}

export async function pauseCampaign(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = campaignActionBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const campaign = await transitionCampaignStatus({
    organizationId,
    campaignId,
    fromStatuses: ["sending"],
    toStatus: "paused",
    errorMessage: "Only sending campaigns can be paused",
    errorCode: "campaign_not_pausable"
  });

  return response.json({
    data: {
      ok: true,
      message: "Campaign paused.",
      campaign
    }
  });
}

export async function resumeCampaign(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = campaignActionBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const campaign = await transitionCampaignStatus({
    organizationId,
    campaignId,
    fromStatuses: ["paused"],
    toStatus: "sending",
    errorMessage: "Only paused campaigns can be resumed",
    errorCode: "campaign_not_resumable"
  });

  return response.json({
    data: {
      ok: true,
      message: "Campaign resumed.",
      campaign
    }
  });
}

export async function cancelCampaign(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = campaignActionBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);

  const campaign = await findCampaign(organizationId, campaignId);

  if (!campaign) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  if (["completed", "cancelled"].includes(campaign.status)) {
    throw new AppError("Completed or cancelled campaigns cannot be cancelled again", 409, "campaign_not_cancellable", {
      status: campaign.status
    });
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        update campaigns
        set status = 'cancelled',
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
      `,
      [organizationId, campaignId]
    );

    await client.query(
      `
        update campaign_recipients
        set send_status = 'skipped',
            next_attempt_at = null,
            error_message = coalesce(error_message, 'Campaign cancelled before dispatch')
        where organization_id = $1
          and campaign_id = $2
          and message_id is null
          and send_status in ('pending', 'queued', 'failed')
      `,
      [organizationId, campaignId]
    );
  });

  return response.json({
    data: {
      ok: true,
      message: "Campaign cancelled. Unsent recipients were skipped.",
      campaign: await getCampaignSummary(organizationId, campaignId)
    }
  });
}

export async function createAudienceGroup(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createAudienceGroupBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);

  const result = await query<AudienceGroupRecord>(
    `
      insert into campaign_audience_groups (
        organization_id,
        name,
        description,
        source,
        status,
        total_rows,
        valid_count,
        invalid_count,
        duplicate_count,
        opt_out_count,
        linked_crm_count,
        created_by
      )
      values ($1, $2, nullif(trim($3), ''), 'csv', 'draft', $4, $5, $6, $7, $8, $9, $10)
      returning *
    `,
    [
      organizationId,
      input.name,
      input.description ?? null,
      input.totalRows ?? 0,
      input.validCount ?? 0,
      input.invalidCount ?? 0,
      input.duplicateCount ?? 0,
      input.optOutCount ?? 0,
      input.linkedCrmCount ?? 0,
      auth.organizationUserId
    ]
  );

  return response.status(201).json({ data: result.rows[0] });
}

export async function getAudienceGroup(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const { audienceGroupId } = audienceGroupParamsSchema.parse(request.params);
  const group = await findAudienceGroup(organizationId, audienceGroupId);

  if (!group) {
    throw new AppError("Audience Group not found", 404, "audience_group_not_found");
  }

  return response.json({ data: group });
}

export async function importAudienceGroupContacts(request: Request, response: Response) {
  const { audienceGroupId } = audienceGroupParamsSchema.parse(request.params);
  const input = importAudienceContactsBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);

  const group = await findAudienceGroup(organizationId, audienceGroupId);

  if (!group) {
    throw new AppError("Audience Group not found", 404, "audience_group_not_found");
  }

  const importableContacts = input.contacts.filter(
    (contact) =>
      contact.validation_status === "valid" &&
      !contact.is_duplicate &&
      !contact.is_opted_out &&
      contact.phone_normalized
  );

  const importedGroup = await withTransaction(async (client) => {
    for (const contact of importableContacts) {
      await client.query(
        `
          insert into campaign_audience_contacts (
            organization_id,
            audience_group_id,
            crm_contact_id,
            name,
            phone_raw,
            phone_normalized,
            gender,
            tag,
            location,
            product_interest,
            customer_type,
            notes,
            validation_status,
            validation_issues,
            is_duplicate,
            is_opted_out
          )
          values ($1, $2, $3, nullif(trim($4), ''), $5, $6, $7, nullif(trim($8), ''), nullif(trim($9), ''), nullif(trim($10), ''), nullif(trim($11), ''), nullif(trim($12), ''), $13, $14::jsonb, $15, $16)
          on conflict (audience_group_id, phone_normalized) do nothing
        `,
        [
          organizationId,
          audienceGroupId,
          contact.crm_contact_id ?? null,
          contact.name ?? null,
          contact.phone_raw,
          contact.phone_normalized,
          contact.gender,
          contact.tag ?? null,
          contact.location ?? null,
          contact.product_interest ?? null,
          contact.customer_type ?? null,
          contact.notes ?? null,
          contact.validation_status,
          JSON.stringify(contact.validation_issues),
          contact.is_duplicate,
          contact.is_opted_out
        ]
      );
    }

    // TODO Phase 1 follow-up: if addValidNewContactsToCrm is true, insert only new valid contacts through ContactCommandService.
    void input.addValidNewContactsToCrm;

    const updateResult = await client.query<AudienceGroupRecord>(
      `
        update campaign_audience_groups
        set status = 'imported',
            total_rows = $3,
            valid_count = $4,
            invalid_count = $5,
            duplicate_count = $6,
            opt_out_count = $7,
            linked_crm_count = $8,
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
        returning *
      `,
      [
        organizationId,
        audienceGroupId,
        input.contacts.length,
        importableContacts.length,
        input.contacts.filter((contact) => contact.validation_status === "invalid").length,
        input.contacts.filter((contact) => contact.is_duplicate).length,
        input.contacts.filter((contact) => contact.is_opted_out).length,
        input.contacts.filter((contact) => Boolean(contact.crm_contact_id)).length
      ]
    );

    return updateResult.rows[0];
  });

  return response.json({ data: importedGroup });
}

export async function getAudienceGroupContacts(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const { audienceGroupId } = audienceGroupParamsSchema.parse(request.params);
  const result = await query(
    `
      select *
      from campaign_audience_contacts
      where organization_id = $1
        and audience_group_id = $2
      order by created_at asc
    `,
    [organizationId, audienceGroupId]
  );

  return response.json({ data: result.rows });
}

export async function deleteAudienceGroup(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const { audienceGroupId } = audienceGroupParamsSchema.parse(request.params);
  await query(
    `
      delete from campaign_audience_groups
      where organization_id = $1
        and id = $2
    `,
    [organizationId, audienceGroupId]
  );

  return response.json({ ok: true });
}

async function findAudienceGroup(organizationId: string, audienceGroupId: string) {
  const result = await query<AudienceGroupRecord>(
    `
      select *
      from campaign_audience_groups
      where organization_id = $1
        and id = $2
      limit 1
    `,
    [organizationId, audienceGroupId]
  );

  return result.rows[0] ?? null;
}

async function findCampaign(organizationId: string, campaignId: string) {
  const result = await query<CampaignRecord>(
    `
      select *
      from campaigns
      where organization_id = $1
        and id = $2
      limit 1
    `,
    [organizationId, campaignId]
  );

  return result.rows[0] ?? null;
}

async function listCampaignSummaries(organizationId: string) {
  const result = await query<CampaignSummaryRecord>(
    `
      select
        c.*,
        ag.name as audience_group_name,
        ag.valid_count as audience_valid_count,
        coalesce(
          (
            select array_agg(csa.whatsapp_account_id order by csa.sort_order asc, csa.created_at asc, csa.id asc)
            from campaign_sender_accounts csa
            where csa.campaign_id = c.id
              and csa.is_enabled = true
          ),
          case
            when c.sender_whatsapp_account_id is not null then array[c.sender_whatsapp_account_id]
            else array[]::uuid[]
          end
        ) as sender_whatsapp_account_ids,
        max(coalesce(to_jsonb(wa)->>'label', to_jsonb(wa)->>'name', to_jsonb(wa)->>'display_name')) as sender_whatsapp_label,
        max(coalesce(
          to_jsonb(wa)->>'account_phone_e164',
          to_jsonb(wa)->>'phone_number',
          to_jsonb(wa)->>'account_phone_normalized',
          to_jsonb(wa)->>'phone_number_normalized'
        )) as sender_phone_number,
        count(cr.id)::text as recipients,
        count(cr.id) filter (where cr.send_status = 'pending')::text as pending,
        count(cr.id) filter (where cr.send_status = 'queued')::text as queued,
        count(cr.id) filter (where cr.send_status = 'sent')::text as sent,
        count(cr.id) filter (where cr.send_status = 'failed')::text as failed,
        count(cr.id) filter (where cr.send_status = 'skipped')::text as skipped,
        0::text as replied
      from campaigns c
      left join campaign_audience_groups ag on ag.id = c.audience_group_id
      left join whatsapp_accounts wa on wa.id = c.sender_whatsapp_account_id
      left join campaign_recipients cr on cr.campaign_id = c.id
      where c.organization_id = $1
      group by c.id, ag.name, ag.valid_count
      order by c.created_at desc, c.name asc
    `,
    [organizationId]
  );

  return result.rows.map(toCampaignSummary);
}

async function getCampaignSummary(organizationId: string, campaignId: string) {
  const result = await query<CampaignSummaryRecord>(
    `
      select
        c.*,
        ag.name as audience_group_name,
        ag.valid_count as audience_valid_count,
        coalesce(
          (
            select array_agg(csa.whatsapp_account_id order by csa.sort_order asc, csa.created_at asc, csa.id asc)
            from campaign_sender_accounts csa
            where csa.campaign_id = c.id
              and csa.is_enabled = true
          ),
          case
            when c.sender_whatsapp_account_id is not null then array[c.sender_whatsapp_account_id]
            else array[]::uuid[]
          end
        ) as sender_whatsapp_account_ids,
        max(coalesce(to_jsonb(wa)->>'label', to_jsonb(wa)->>'name', to_jsonb(wa)->>'display_name')) as sender_whatsapp_label,
        max(coalesce(
          to_jsonb(wa)->>'account_phone_e164',
          to_jsonb(wa)->>'phone_number',
          to_jsonb(wa)->>'account_phone_normalized',
          to_jsonb(wa)->>'phone_number_normalized'
        )) as sender_phone_number,
        count(cr.id)::text as recipients,
        count(cr.id) filter (where cr.send_status = 'pending')::text as pending,
        count(cr.id) filter (where cr.send_status = 'queued')::text as queued,
        count(cr.id) filter (where cr.send_status = 'sent')::text as sent,
        count(cr.id) filter (where cr.send_status = 'failed')::text as failed,
        count(cr.id) filter (where cr.send_status = 'skipped')::text as skipped,
        0::text as replied
      from campaigns c
      left join campaign_audience_groups ag on ag.id = c.audience_group_id
      left join whatsapp_accounts wa on wa.id = c.sender_whatsapp_account_id
      left join campaign_recipients cr on cr.campaign_id = c.id
      where c.organization_id = $1
        and c.id = $2
      group by c.id, ag.name, ag.valid_count
      limit 1
    `,
    [organizationId, campaignId]
  );

  const row = result.rows[0];
  return row ? toCampaignSummary(row) : null;
}

async function transitionCampaignStatus(input: {
  organizationId: string;
  campaignId: string;
  fromStatuses: string[];
  toStatus: string;
  errorMessage: string;
  errorCode: string;
}) {
  const existing = await findCampaign(input.organizationId, input.campaignId);

  if (!existing) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  if (!input.fromStatuses.includes(existing.status)) {
    throw new AppError(input.errorMessage, 409, input.errorCode, {
      status: existing.status
    });
  }

  await query(
    `
      update campaigns
      set status = $3,
          updated_at = timezone('utc', now())
      where organization_id = $1
        and id = $2
    `,
    [input.organizationId, input.campaignId, input.toStatus]
  );

  return getCampaignSummary(input.organizationId, input.campaignId);
}

function toCampaignSummary(row: CampaignSummaryRecord) {
  return {
    id: row.id,
    name: row.name,
    audience: row.audience_group_name ?? "Audience Group",
    audienceGroupId: row.audience_group_id,
    audienceGroupName: row.audience_group_name,
    audienceValidCount: row.audience_valid_count ?? 0,
    senderMode: row.sender_mode,
    senderWhatsAppAccountId: row.sender_whatsapp_account_id,
    senderWhatsAppAccountIds: row.sender_whatsapp_account_ids ?? (row.sender_whatsapp_account_id ? [row.sender_whatsapp_account_id] : []),
    senderWhatsAppLabel: row.sender_whatsapp_label,
    senderPhoneNumber: row.sender_phone_number,
    speedPreset: row.speed_preset,
    delayPerMessageSeconds: row.delay_per_message_seconds,
    batchSize: row.batch_size,
    batchPauseSeconds: row.batch_pause_seconds,
    dailyLimit: row.daily_limit,
    stopOnHighFailure: row.stop_on_high_failure,
    status: formatCampaignStatus(row.status),
    recipients: Number(row.recipients),
    pending: Number(row.pending),
    queued: Number(row.queued),
    sent: Number(row.sent),
    failed: Number(row.failed),
    skipped: Number(row.skipped),
    replied: Number(row.replied),
    createdAt: row.created_at
  };
}

function toCampaignRecipient(row: CampaignRecipientRecord) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    audienceGroupContactId: row.audience_group_contact_id,
    crmContactId: row.crm_contact_id,
    name: row.name,
    phoneNormalized: row.phone_normalized,
    gender: row.gender,
    salutation: row.salutation,
    tag: row.tag,
    location: row.location,
    productInterest: row.product_interest,
    customerType: row.customer_type,
    notes: row.notes,
    sendStatus: row.send_status,
    messageId: row.message_id,
    attemptCount: row.attempt_count,
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    nextAttemptAt: row.next_attempt_at,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const normalized = cell.replace(/\r?\n/g, " ");
          return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
        })
        .join(",")
    )
    .join("\r\n");
}

function toSafeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campaign";
}

function formatCampaignStatus(status: string) {
  return status
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function assertCampaignExists(organizationId: string, campaignId: string) {
  const campaign = await findCampaign(organizationId, campaignId);

  if (!campaign) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }
}

async function assertConnectedSender(organizationId: string, senderWhatsAppAccountId: string) {
  const result = await query(
    `
      select id
      from whatsapp_accounts
      where organization_id = $1
        and id = $2
        and lower(coalesce(to_jsonb(whatsapp_accounts)->>'connection_status', to_jsonb(whatsapp_accounts)->>'status', '')) = any($3::text[])
      limit 1
    `,
    [organizationId, senderWhatsAppAccountId, ["connected", "open", "ready"]]
  );

  if (!result.rows[0]) {
    throw new AppError("Connected WhatsApp sender is required", 400, "sender_not_connected");
  }

  try {
    const liveStatus = await connectorClient.getAccountStatus(senderWhatsAppAccountId);

    if (!liveStatus.connected) {
      throw new AppError(
        "Selected WhatsApp sender is not live connected. Reconnect the sender and try again.",
        400,
        "sender_not_connected"
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      "Unable to verify the selected WhatsApp sender with the live connector. Reconnect the sender and try again.",
      502,
      "sender_status_unverified"
    );
  }
}

async function assertConnectedSenders(organizationId: string, senderWhatsAppAccountIds: string[]) {
  for (const senderWhatsAppAccountId of senderWhatsAppAccountIds) {
    await assertConnectedSender(organizationId, senderWhatsAppAccountId);
  }
}

function resolveSenderSelection(
  input: {
    senderWhatsAppAccountId?: string;
    senderWhatsAppAccountIds?: string[];
    senderMode?: "single" | "round_robin";
  },
  fallbackSenderWhatsAppAccountId?: string | null
) {
  const senderIds = Array.from(
    new Set(
      [
        ...(input.senderWhatsAppAccountIds ?? []),
        input.senderWhatsAppAccountId,
        fallbackSenderWhatsAppAccountId ?? undefined
      ].filter((value): value is string => Boolean(value))
    )
  );

  if (senderIds.length === 0) {
    throw new AppError("At least one connected WhatsApp sender is required", 400, "sender_not_connected");
  }

  return {
    primarySenderWhatsAppAccountId: input.senderWhatsAppAccountId ?? senderIds[0],
    senderWhatsAppAccountIds: senderIds,
    senderMode: senderIds.length > 1 ? "round_robin" : (input.senderMode ?? "single")
  };
}

async function syncCampaignSenderAccounts(
  client: Parameters<typeof withTransaction>[0] extends (client: infer T) => Promise<unknown> ? T : never,
  input: {
    organizationId: string;
    campaignId: string;
    senderWhatsAppAccountIds: string[];
  }
) {
  for (const [index, senderWhatsAppAccountId] of input.senderWhatsAppAccountIds.entries()) {
    await client.query(
      `
        insert into campaign_sender_accounts (
          organization_id,
          campaign_id,
          whatsapp_account_id,
          is_enabled,
          sort_order
        )
        values ($1, $2, $3, true, $4)
        on conflict (campaign_id, whatsapp_account_id)
        do update set
          is_enabled = true,
          sort_order = excluded.sort_order,
          updated_at = timezone('utc', now())
      `,
      [input.organizationId, input.campaignId, senderWhatsAppAccountId, index]
    );
  }

  await client.query(
    `
      update campaign_sender_accounts
      set is_enabled = false,
          updated_at = timezone('utc', now())
      where organization_id = $1
        and campaign_id = $2
        and not (whatsapp_account_id = any($3::uuid[]))
    `,
    [input.organizationId, input.campaignId, input.senderWhatsAppAccountIds]
  );
}

async function assertReadyAudienceGroup(organizationId: string, audienceGroupId: string) {
  const group = await findAudienceGroup(organizationId, audienceGroupId);

  if (!group || group.status !== "imported" || group.valid_count <= 0) {
    throw new AppError("Audience Group with valid contacts is required", 400, "audience_group_not_ready");
  }
}

async function sendCampaignTestMessage(input: {
  organizationId: string;
  organizationUserId?: string | null;
  senderWhatsAppAccountId: string;
  testPhoneNumber: string;
  messageTemplate: string;
}) {
  return sendCampaignRecipientMessage({
    organizationId: input.organizationId,
    organizationUserId: input.organizationUserId ?? null,
    senderWhatsAppAccountId: input.senderWhatsAppAccountId,
    phoneNumber: input.testPhoneNumber,
    profileName: null,
    text: input.messageTemplate,
    waitForDispatch: true
  });
}

async function sendCampaignRecipientMessage(input: {
  organizationId: string;
  organizationUserId?: string | null;
  senderWhatsAppAccountId: string;
  phoneNumber: string;
  profileName?: string | null;
  text: string;
  waitForDispatch?: boolean;
}) {
  const normalizedPhone = normalizePhoneNumber(input.phoneNumber);

  if (!normalizedPhone) {
    throw new AppError("Enter a valid recipient phone number", 400, "invalid_recipient_phone_number");
  }

  const recipientJid = `${normalizedPhone.replace(/\D/g, "")}@s.whatsapp.net`;
  const conversation = await withTransaction(async (client) => {
    const { contact } = await contactService.findOrCreateCanonicalContact(client, {
      organizationId: input.organizationId,
      whatsappAccountId: input.senderWhatsAppAccountId,
      whatsappJid: recipientJid,
      phoneRaw: normalizedPhone,
      profileName: input.profileName ?? null,
      profilePushName: null,
      profileAvatarUrl: null
    });

    return conversationService.findOrCreateConversation(client, {
      organizationId: input.organizationId,
      whatsappAccountId: input.senderWhatsAppAccountId,
      contactId: contact.id
    });
  });

  return sendMessageService.send({
    organizationId: input.organizationId,
    whatsappAccountId: input.senderWhatsAppAccountId,
    conversationId: conversation.id,
    organizationUserId: input.organizationUserId ?? null,
    text: input.text
  }, { waitForDispatch: input.waitForDispatch ?? false });
}

async function snapshotCampaignRecipients(input: {
  organizationId: string;
  campaignId: string;
  audienceGroupId: string;
}) {
  const result = await query<CampaignAudienceContactRecord>(
    `
      with deleted as (
        delete from campaign_recipients
        where organization_id = $1
          and campaign_id = $2
      ),
      inserted as (
        insert into campaign_recipients (
          organization_id,
          campaign_id,
          audience_group_contact_id,
          crm_contact_id,
          name,
          phone_normalized,
          gender,
          salutation,
          tag,
          location,
          product_interest,
          customer_type,
          notes
        )
        select
          organization_id,
          $2,
          id,
          crm_contact_id,
          name,
          phone_normalized,
          gender,
          salutation,
          tag,
          location,
          product_interest,
          customer_type,
          notes
        from campaign_audience_contacts
        where organization_id = $1
          and audience_group_id = $3
          and validation_status = 'valid'
          and is_duplicate = false
          and is_opted_out = false
        returning
          audience_group_contact_id as id,
          crm_contact_id,
          name,
          phone_normalized,
          gender,
          salutation,
          tag,
          location,
          product_interest,
          customer_type,
          notes
      )
      select * from inserted
    `,
    [input.organizationId, input.campaignId, input.audienceGroupId]
  );

  return result.rows;
}

function renderCampaignMessage(template: string, recipient: {
  name: string | null;
  phone: string | null;
  gender: string | null;
  salutation: string | null;
  tag: string | null;
  location: string | null;
  product_interest: string | null;
  customer_type: string | null;
  notes: string | null;
}) {
  const salutation =
    recipient.salutation ??
    (recipient.gender === "male" ? "Encik" : recipient.gender === "female" ? "Puan" : "");

  const values: Record<string, string> = {
    name: recipient.name ?? "",
    phone: recipient.phone ?? "",
    gender: recipient.gender ?? "",
    salutation,
    tag: recipient.tag ?? "",
    location: recipient.location ?? "",
    product_interest: recipient.product_interest ?? "",
    customer_type: recipient.customer_type ?? "",
    notes: recipient.notes ?? ""
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}
