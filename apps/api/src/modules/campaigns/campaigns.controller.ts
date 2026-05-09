import type { Request, Response } from "express";
import { z } from "zod";
import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";

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

const createCampaignBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  senderWhatsAppAccountId: z.string().uuid(),
  audienceGroupId: z.string().uuid(),
  messageTemplate: z.string().trim().min(1).max(5000),
  tempo: tempoSchema
});

const updateCampaignBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160).optional(),
  senderWhatsAppAccountId: z.string().uuid().optional(),
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
  senderWhatsAppAccountId: z.string().uuid(),
  audienceGroupId: z.string().uuid(),
  messageTemplate: z.string().trim().min(1),
  speedPreset: z.enum(["safe", "normal", "custom"]).default("safe")
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
  const result = await query<CampaignRecord>(
    `
      select *
      from campaigns
      where organization_id = $1
      order by created_at desc, name asc
    `,
    [organizationId]
  );

  return response.json({ data: result.rows });
}

export async function createCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);

  await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  await assertReadyAudienceGroup(organizationId, input.audienceGroupId);

  const result = await query<CampaignRecord>(
    `
      insert into campaigns (
        organization_id,
        name,
        status,
        audience_group_id,
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
      values ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      returning *
    `,
    [
      organizationId,
      input.name,
      input.audienceGroupId,
      input.senderWhatsAppAccountId,
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

  return response.status(201).json({ data: result.rows[0] });
}

export async function getCampaign(request: Request, response: Response) {
  const organizationId = resolveOrganizationId(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const campaign = await findCampaign(organizationId, campaignId);

  if (!campaign) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  return response.json({ data: campaign });
}

export async function updateCampaign(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = updateCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const existing = await findCampaign(organizationId, campaignId);

  if (!existing) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  if (input.senderWhatsAppAccountId) {
    await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  }

  if (input.audienceGroupId) {
    await assertReadyAudienceGroup(organizationId, input.audienceGroupId);
  }

  const nextTempo = input.tempo;
  const result = await query<CampaignRecord>(
    `
      update campaigns
      set name = coalesce($3, name),
          audience_group_id = coalesce($4, audience_group_id),
          sender_whatsapp_account_id = coalesce($5, sender_whatsapp_account_id),
          message_template = coalesce($6, message_template),
          speed_preset = coalesce($7, speed_preset),
          delay_per_message_seconds = coalesce($8, delay_per_message_seconds),
          batch_size = coalesce($9, batch_size),
          batch_pause_seconds = coalesce($10, batch_pause_seconds),
          daily_limit = coalesce($11, daily_limit),
          stop_on_high_failure = coalesce($12, stop_on_high_failure),
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
      input.senderWhatsAppAccountId ?? null,
      input.messageTemplate ?? null,
      nextTempo?.speedPreset ?? null,
      nextTempo?.delayPerMessageSeconds ?? null,
      nextTempo?.batchSize ?? null,
      nextTempo?.batchPauseSeconds ?? null,
      nextTempo?.dailyLimit ?? null,
      nextTempo?.stopOnHighFailure ?? null
    ]
  );

  return response.json({ data: result.rows[0] });
}

export async function sendCampaignTestPreview(request: Request, response: Response) {
  const input = sendTestBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  return response.json({
    data: {
      ok: true,
      message: `Test message would be sent from ${input.senderWhatsAppAccountId} to ${input.testPhoneNumber}.`
    }
  });
}

export async function sendCampaignTest(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = sendTestBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  await assertCampaignExists(organizationId, campaignId);
  await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  return response.json({
    data: {
      ok: true,
      message: `Test message would be sent from ${input.senderWhatsAppAccountId} to ${input.testPhoneNumber}.`
    }
  });
}

export async function startCampaignPreview(request: Request, response: Response) {
  const input = startCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  await assertReadyAudienceGroup(organizationId, input.audienceGroupId);
  return response.json({
    data: {
      ok: true,
      message: `Campaign queued using ${input.senderWhatsAppAccountId} for ${input.audienceGroupId} with ${input.speedPreset} tempo.`
    }
  });
}

export async function startCampaign(request: Request, response: Response) {
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = startCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  await assertCampaignExists(organizationId, campaignId);
  await assertConnectedSender(organizationId, input.senderWhatsAppAccountId);
  await assertReadyAudienceGroup(organizationId, input.audienceGroupId);

  const result = await query<CampaignRecord>(
    `
      update campaigns
      set status = 'scheduled',
          updated_at = timezone('utc', now())
      where organization_id = $1
        and id = $2
      returning *
    `,
    [organizationId, campaignId]
  );

  return response.json({
    data: {
      ok: true,
      message: `Campaign queued using ${input.senderWhatsAppAccountId} for ${input.audienceGroupId} with ${input.speedPreset} tempo.`,
      campaign: result.rows[0]
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
        and lower(status) = any($3::text[])
      limit 1
    `,
    [organizationId, senderWhatsAppAccountId, ["connected", "open", "ready"]]
  );

  if (!result.rows[0]) {
    throw new AppError("Connected WhatsApp sender is required", 400, "sender_not_connected");
  }
}

async function assertReadyAudienceGroup(organizationId: string, audienceGroupId: string) {
  const group = await findAudienceGroup(organizationId, audienceGroupId);

  if (!group || group.status !== "imported" || group.valid_count <= 0) {
    throw new AppError("Audience Group with valid contacts is required", 400, "audience_group_not_ready");
  }
}
