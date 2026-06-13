import type { Request, Response } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";
import {
  CAMPAIGN_INLINE_MEDIA_MIGRATION_THRESHOLD_BYTES,
  estimateBase64Bytes,
  parseInlineMediaAttachment
} from "../../lib/mediaAttachments.js";
import { ConnectorClient } from "../../services/connectorClient.js";
import { CampaignRiskGuardService } from "../../services/campaignRiskGuardService.js";
import { CampaignSafetyService } from "../../services/campaignSafetyService.js";
import { MediaAssetService } from "../../services/mediaAssetService.js";
import { snapshotCampaignRecipientsSafely } from "../../services/campaignRecoveryService.js";
import { assertCampaignTemplateVariablesAvailable } from "./campaignTemplateVariables.js";
import { campaignSpeedPresetSchema, resolveCampaignTempo, type CampaignSpeedPreset, type CampaignTempo } from "./campaignTempo.js";

const connectorClient = new ConnectorClient();
const campaignSafetyService = new CampaignSafetyService();
const campaignRiskGuardService = new CampaignRiskGuardService();
const mediaAssetService = new MediaAssetService();

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
  speedPreset: campaignSpeedPresetSchema.optional(),
  delayPerMessageSeconds: z.number().int().positive().optional(),
  batchSize: z.number().int().positive().optional(),
  batchPauseSeconds: z.number().int().positive().optional(),
  dailyLimit: z.number().int().positive().optional(),
  stopOnHighFailure: z.boolean().optional()
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
  media_id: string | null;
  attachment: unknown | null;
  speed_preset: CampaignSpeedPreset | null;
  delay_per_message_seconds: number | null;
  batch_size: number | null;
  batch_pause_seconds: number | null;
  daily_limit: number | null;
  stop_on_high_failure: boolean | null;
  attach_contact_card: boolean;
};

type AudienceGroupRecord = {
  id: string;
  status: string;
  valid_count: number;
  storage_status: string;
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

  const baseMessageTemplate = input.messageTemplate?.trim() || campaign.message_template?.trim();
  const effectiveMessageTemplate = await campaignRiskGuardService.getEffectiveMessageBody(
    organizationId,
    campaignId,
    baseMessageTemplate ?? null
  );
  if (!effectiveMessageTemplate) {
    throw new AppError("Message template is required", 400, "message_template_required");
  }

  const senderSelection = resolveSenderSelection(input, campaign.sender_whatsapp_account_id);
  const tempo = resolveCampaignTempo({
    speedPreset: input.speedPreset ?? campaign.speed_preset ?? undefined,
    delayPerMessageSeconds: input.delayPerMessageSeconds ?? campaign.delay_per_message_seconds ?? undefined,
    batchSize: input.batchSize ?? campaign.batch_size ?? undefined,
    batchPauseSeconds: input.batchPauseSeconds ?? campaign.batch_pause_seconds ?? undefined,
    dailyLimit: input.dailyLimit ?? campaign.daily_limit ?? undefined,
    stopOnHighFailure: input.stopOnHighFailure ?? campaign.stop_on_high_failure ?? undefined
  });

  await assertConnectedSenders(organizationId, senderSelection.senderWhatsAppAccountIds);
  await assertReadyAudienceGroup(organizationId, audienceGroupId);
  await assertCampaignTemplateVariablesAvailable({
    organizationId,
    audienceGroupId,
    template: effectiveMessageTemplate
  });
  const storedAttachment = await ensureCampaignAttachmentStored({
    organizationId,
    campaignId,
    attachment: campaign.attachment,
    status: campaign.status
  });
  await saveCampaignStartConfiguration({
    organizationId,
    campaignId,
    audienceGroupId,
    senderMode: senderSelection.senderMode,
    primarySenderWhatsAppAccountId: senderSelection.primarySenderWhatsAppAccountId,
    senderWhatsAppAccountIds: senderSelection.senderWhatsAppAccountIds,
    messageTemplate: baseMessageTemplate ?? effectiveMessageTemplate,
    mediaId: storedAttachment?.mediaId ?? campaign.media_id ?? null,
    attachment: storedAttachment ? JSON.stringify(storedAttachment) : null,
    tempo
  });

  const snapshot = await snapshotCampaignRecipients({
    organizationId,
    campaignId,
    audienceGroupId,
    messageTemplate: effectiveMessageTemplate
  });

  if (!snapshot.hasHistory && snapshot.affectedCount === 0) {
    throw new AppError("Audience Group has no valid recipients to send", 400, "campaign_no_valid_recipients");
  }

  const validationSummary = await campaignSafetyService.validateCampaignRecipients(auth, { organizationId, campaignId, audit: false });
  if (Number(validationSummary.valid ?? 0) <= 0) {
    throw new AppError("Campaign has no recipients that passed safety validation", 400, "campaign_no_safe_recipients", validationSummary);
  }
  await campaignSafetyService.assertCampaignCanStart(auth, { organizationId, campaignId });

  const result = await withTransaction(async (client) => {
    const updated = await client.query<CampaignRecord>(
      `
        update campaigns
        set status = 'sending',
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
        returning *
      `,
      [organizationId, campaignId]
    );

    return updated.rows[0];
  });

  return response.json({
    data: {
      ok: true,
      message: snapshot.hasHistory
        ? "Campaign started from existing history. Sent recipients were preserved, pending recipients will continue, and failed recipients remain failed until manually retried."
        : `Campaign started. ${snapshot.affectedCount} recipient${snapshot.affectedCount === 1 ? "" : "s"} scheduled for paced dispatch.`,
      campaign: result,
      scheduled: snapshot.affectedCount
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
  messageTemplate?: string | null;
}) {
  return snapshotCampaignRecipientsSafely(input);
}

async function saveCampaignStartConfiguration(input: {
  organizationId: string;
  campaignId: string;
  audienceGroupId: string;
  senderMode: "single" | "round_robin";
  primarySenderWhatsAppAccountId: string;
  senderWhatsAppAccountIds: string[];
  messageTemplate: string;
  mediaId: string | null;
  attachment: string | null;
  tempo: CampaignTempo;
}) {
  await withTransaction(async (client) => {
    await client.query(
      `
        update campaigns
        set audience_group_id = $3,
            sender_mode = $4,
            sender_whatsapp_account_id = $5,
            message_template = $6,
            media_id = coalesce($7, media_id),
            attachment = coalesce($8, attachment),
            speed_preset = $9,
            delay_per_message_seconds = $10,
            batch_size = $11,
            batch_pause_seconds = $12,
            daily_limit = $13,
            stop_on_high_failure = $14,
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
      `,
      [
        input.organizationId,
        input.campaignId,
        input.audienceGroupId,
        input.senderMode,
        input.primarySenderWhatsAppAccountId,
        input.messageTemplate,
        input.mediaId,
        input.attachment,
        input.tempo.speedPreset,
        input.tempo.delayPerMessageSeconds,
        input.tempo.batchSize,
        input.tempo.batchPauseSeconds,
        input.tempo.dailyLimit,
        input.tempo.stopOnHighFailure
      ]
    );

    await syncCampaignSenderAccounts(client, {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      senderWhatsAppAccountIds: input.senderWhatsAppAccountIds
    });
  });
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

async function ensureCampaignAttachmentStored(input: {
  organizationId: string;
  campaignId: string;
  attachment: unknown;
  status: string;
}) {
  const inline = parseInlineMediaAttachment(input.attachment);
  if (!inline) {
    return null;
  }

  const inlineBytes = inline.fileSizeBytes || estimateBase64Bytes(inline.dataBase64);
  if (input.status === "paused" && inlineBytes > CAMPAIGN_INLINE_MEDIA_MIGRATION_THRESHOLD_BYTES) {
    throw new AppError(
      "Campaign media must be stored as a media asset before sending.",
      409,
      "campaign_media_migration_required"
    );
  }

  const stored = await mediaAssetService.ensureStoredReference({
    organizationId: input.organizationId,
    source: "campaign-media",
    attachment: inline
  });

  await query(
    `
      update campaigns
      set media_id = $3,
          attachment = $4,
          updated_at = timezone('utc', now())
      where organization_id = $1
        and id = $2
    `,
    [input.organizationId, input.campaignId, stored.mediaId ?? null, JSON.stringify(stored)]
  );

  logger.warn(
    {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      originalInlineBytes: inlineBytes,
      mediaId: stored.mediaId ?? null
    },
    "Migrated legacy inline campaign attachment to media asset storage before start"
  );

  return stored;
}
