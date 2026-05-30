import type { Request, Response } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";
import { ConnectorClient } from "../../services/connectorClient.js";
import { CampaignSafetyService } from "../../services/campaignSafetyService.js";

const connectorClient = new ConnectorClient();
const campaignSafetyService = new CampaignSafetyService();

const campaignParamsSchema = z.object({
  campaignId: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const senderPoolSchema = z.array(z.string().uuid()).min(1).max(32);
const senderModeSchema = z.enum(["single", "round_robin"]);

const startExistingCampaignBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  senderWhatsAppAccountId: z.string().uuid().optional(),
  senderWhatsAppAccountIds: senderPoolSchema.optional(),
  senderMode: senderModeSchema.optional(),
  audienceGroupId: z.string().uuid().optional(),
  messageTemplate: z.string().trim().min(1).max(5000).optional(),
  speedPreset: z.enum(["safe", "normal", "custom"]).optional()
});

type AuthUser = NonNullable<Request["auth"]>;

type CampaignRecord = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  audience_group_id: string | null;
  sender_mode: "single" | "round_robin";
  sender_whatsapp_account_id: string | null;
  message_template: string | null;
  message_body_type: string;
  attachment: unknown | null;
  speed_preset: "safe" | "normal" | "custom";
  attach_contact_card: boolean;
};

type AudienceGroupRecord = {
  id: string;
  status: string;
  valid_count: number;
  storage_status: string;
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

function requireAuth(request: Request): AuthUser {
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

export async function startExistingCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = startExistingCampaignBodySchema.parse(request.body);
  const organizationId = resolveOrganizationId(request, input.organizationId);
  const campaign = await findCampaign(organizationId, campaignId);

  if (!campaign) {
    throw new AppError("Campaign not found", 404, "campaign_not_found");
  }

  if (!["draft", "scheduled", "failed"].includes(campaign.status)) {
    throw new AppError("Only draft, scheduled or failed campaigns can be started", 409, "campaign_not_startable", {
      status: campaign.status
    });
  }

  const audienceGroupId = input.audienceGroupId ?? campaign.audience_group_id;
  if (!audienceGroupId) {
    throw new AppError("Audience Group is required", 400, "audience_group_required");
  }

  const messageTemplate = input.messageTemplate?.trim() || campaign.message_template?.trim();
  if (!messageTemplate) {
    throw new AppError("Message template is required", 400, "message_template_required");
  }

  const senderSelection = resolveSenderSelection(input, campaign.sender_whatsapp_account_id);

  await assertConnectedSenders(organizationId, senderSelection.senderWhatsAppAccountIds);
  await assertReadyAudienceGroup(organizationId, audienceGroupId);
  await campaignSafetyService.assertCampaignCanStart(auth, { organizationId, campaignId });

  const snapshot = await snapshotCampaignRecipients({
    organizationId,
    campaignId,
    audienceGroupId
  });

  if (snapshot.length === 0) {
    throw new AppError("Audience Group has no valid recipients to send", 400, "campaign_no_valid_recipients");
  }

  const validationSummary = await campaignSafetyService.validateCampaignRecipients(auth, { organizationId, campaignId, audit: false });
  if (Number(validationSummary.valid ?? 0) <= 0) {
    throw new AppError("Campaign has no recipients that passed safety validation", 400, "campaign_no_safe_recipients", validationSummary);
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
        audienceGroupId,
        messageTemplate,
        input.speedPreset ?? campaign.speed_preset ?? "safe"
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

async function assertConnectedSenders(organizationId: string, senderWhatsAppAccountIds: string[]) {
  for (const senderWhatsAppAccountId of senderWhatsAppAccountIds) {
    await assertConnectedSender(organizationId, senderWhatsAppAccountId);
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

async function assertReadyAudienceGroup(organizationId: string, audienceGroupId: string) {
  const result = await query<AudienceGroupRecord>(
    `
      select id, status, valid_count, storage_status
      from campaign_audience_groups
      where organization_id = $1
        and id = $2
      limit 1
    `,
    [organizationId, audienceGroupId]
  );
  const group = result.rows[0];

  if (!group || group.status !== "imported" || group.valid_count <= 0 || group.storage_status === "deleted_details") {
    throw new AppError("Audience Group with valid contacts is required", 400, "audience_group_not_ready");
  }
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

async function syncCampaignSenderAccounts(
  client: PoolClient,
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
