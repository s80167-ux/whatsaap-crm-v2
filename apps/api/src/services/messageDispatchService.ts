import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { CampaignSafetyService } from "./campaignSafetyService.js";
import {
  classifyCampaignSendFailure,
  isSenderIssueFailureCode,
  pauseCampaignForSenderIssue
} from "./campaignRecoveryService.js";
import {
  MessageDispatchOutboxRepository,
  type MessageDispatchOutboxRecord,
  type PendingOutboundDraftRecord
} from "../repositories/messageDispatchOutboxRepository.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";
import { ConnectorClient } from "./connectorClient.js";
import { ProjectionService } from "./projectionService.js";
import { MediaAssetService } from "./mediaAssetService.js";

export class MessageDispatchService {
  constructor(
    private readonly outboxRepository = new MessageDispatchOutboxRepository(),
    private readonly messageRepository = new MessageRepository(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly rawEventRepository = new RawEventRepository(),
    private readonly connectorClient = new ConnectorClient(),
    private readonly projectionService = new ProjectionService(),
    private readonly mediaAssetService = new MediaAssetService()
  ) {}

  async enqueue(
    client: PoolClient,
    input: {
      organizationId: string;
      messageId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      recipientJid: string;
      messageText: string;
      source: "manual" | "quick_reply" | "campaign" | "system";
      priority: number;
      availableAt?: string | null;
      payload?: unknown;
    }
  ) {
    return this.outboxRepository.create(client, {
      organizationId: input.organizationId,
      messageId: input.messageId,
      conversationId: input.conversationId,
      contactId: input.contactId,
      whatsappAccountId: input.whatsappAccountId,
      recipientJid: input.recipientJid,
      messageText: input.messageText,
      source: input.source,
      priority: input.priority,
      availableAt: input.availableAt ?? null,
      payload: input.payload
    });
  }

  async enqueueInNewTransaction(input: {
    organizationId: string;
    messageId: string;
    conversationId: string;
    contactId: string;
    whatsappAccountId: string;
    recipientJid: string;
    messageText: string;
    source: "manual" | "quick_reply" | "campaign" | "system";
    priority: number;
    availableAt?: string | null;
    payload?: unknown;
  }) {
    return withTransaction((client) =>
      this.outboxRepository.create(client, {
        organizationId: input.organizationId,
        messageId: input.messageId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        whatsappAccountId: input.whatsappAccountId,
        recipientJid: input.recipientJid,
        messageText: input.messageText,
        source: input.source,
        priority: input.priority,
        availableAt: input.availableAt ?? null,
        payload: input.payload
      })
    );
  }

  async processPendingBatch(limit = env.MESSAGE_OUTBOX_WORKER_BATCH_SIZE) {
    const staleBefore = new Date(Date.now() - env.MESSAGE_OUTBOX_WORKER_STALE_AFTER_MS);

    await withTransaction((client) => this.outboxRepository.resetStaleProcessing(client, staleBefore));
    await this.repairOrphanedPendingDrafts(Math.max(limit, 1));
    await this.finalizeExhaustedOpenJobs(Math.max(limit, 1));

    const dueJobs = await withTransaction((client) =>
      this.outboxRepository.listDueJobs(client, Math.max(limit * 4, limit), env.MESSAGE_OUTBOX_WORKER_MAX_RETRIES)
    );

    const claimed: MessageDispatchOutboxRecord[] = [];
    const claimedAccounts = new Set<string>();

    for (const job of dueJobs) {
      if (claimed.length >= limit || claimedAccounts.has(job.whatsapp_account_id)) {
        continue;
      }

      const claimedJob = await withTransaction((client) =>
        this.outboxRepository.claimById(client, {
          outboxId: job.id,
          maxRetries: env.MESSAGE_OUTBOX_WORKER_MAX_RETRIES
        })
      );

      if (!claimedJob) {
        continue;
      }

      claimed.push(claimedJob);
      claimedAccounts.add(claimedJob.whatsapp_account_id);
    }

    for (const job of claimed) {
      await this.processJob(job);
    }

    return claimed.length;
  }

  private async finalizeExhaustedOpenJobs(limit: number) {
    const jobs = await withTransaction((client) =>
      this.outboxRepository.listExhaustedOpenJobs(client, limit, env.MESSAGE_OUTBOX_WORKER_MAX_RETRIES)
    );

    for (const job of jobs) {
      await withTransaction(async (client) => {
        const errorMessage = job.last_error ?? "Message dispatch exhausted all retry attempts";

        await this.messageRepository.appendStatusEvent(client, {
          messageId: job.message_id,
          status: "failed",
          payload: { error: errorMessage }
        });

        await this.messageRepository.updateAckStatus(client, {
          messageId: job.message_id,
          ackStatus: "failed",
          failedAt: new Date()
        });

        await this.outboxRepository.markFailed(client, {
          outboxId: job.id,
          errorMessage,
          nextAttemptAt: null,
          payload: { error: errorMessage }
        });

        await this.markCampaignRecipientFailed(client, job, classifyCampaignSendFailure(errorMessage), false);
      });
    }
  }

  async processJob(job: MessageDispatchOutboxRecord): Promise<{ ok: true } | { ok: false; errorMessage: string }> {
    try {
      const skipAutoReply = await this.shouldSkipAutoReply(job);
      if (skipAutoReply) {
        await withTransaction(async (client) => {
          await this.messageRepository.appendStatusEvent(client, {
            messageId: job.message_id,
            status: "skipped",
            payload: { reason: skipAutoReply.reason, auto_reply: true }
          });

          await this.messageRepository.updateAckStatus(client, {
            messageId: job.message_id,
            ackStatus: "failed",
            failedAt: new Date()
          });

          await client.query(
            `
              update messages
              set is_deleted = true,
                  content_json = coalesce(content_json, '{}'::jsonb) || $3::jsonb,
                  updated_at = timezone('utc', now())
              where organization_id = $1
                and id = $2
            `,
            [
              job.organization_id,
              job.message_id,
              JSON.stringify({
                autoReply: {
                  skipped: true,
                  reason: skipAutoReply.reason
                }
              })
            ]
          );

          await client.query(
            `
              update auto_reply_events
              set status = 'skipped',
                  metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
              where organization_id = $1
                and outbound_message_id = $2
                and inbound_message_id = $3
            `,
            [
              job.organization_id,
              job.message_id,
              skipAutoReply.inboundMessageId,
              JSON.stringify({ skipped_reason: skipAutoReply.reason })
            ]
          );

          await this.projectionService.refreshForMessage(client, {
            organizationId: job.organization_id,
            conversationId: job.conversation_id,
            contactId: job.contact_id,
            sentAt: new Date()
          });

          await this.outboxRepository.markDispatched(client, {
            outboxId: job.id,
            connectorMessageId: null,
            payload: {
              ...(job.payload && typeof job.payload === "object" && !Array.isArray(job.payload) ? job.payload : {}),
              autoReplySkipped: skipAutoReply.reason
            }
          });
        });

        return { ok: true };
      }

      const outbound = await this.connectorClient.sendMessage({
        accountId: job.whatsapp_account_id,
        recipientJid: job.recipient_jid,
        text: job.message_text,
        attachment: await this.resolveAttachmentPayload(job.payload),
        contactCard: this.extractContactCardPayload(job.payload)
      });

      const sentAt = new Date();
      const connectorMessageId = this.extractConnectorMessageId(outbound);
      const externalMessageId = connectorMessageId ?? `dispatch:${crypto.randomUUID()}`;

      await withTransaction(async (client) => {
        await this.messageRepository.updateOutboundDispatch(client, {
          messageId: job.message_id,
          externalMessageId,
          externalChatId: job.recipient_jid,
          rawPayload: outbound ?? null,
          sentAt
        });

        if (connectorMessageId) {
          await this.rawEventRepository.requeueStatusEventsByExternalEventId(client, {
            organizationId: job.organization_id,
            whatsappAccountId: job.whatsapp_account_id,
            externalEventId: connectorMessageId
          });
        }

        await this.messageRepository.appendStatusEvent(client, {
          messageId: job.message_id,
          status: "server_ack",
          payload: outbound ?? null
        });

        await this.messageRepository.updateAckStatus(client, {
          messageId: job.message_id,
          ackStatus: "server_ack"
        });

        await this.conversationRepository.bumpLastMessage(client, {
          conversationId: job.conversation_id,
          direction: "outgoing",
          sentAt,
          incrementUnread: false
        });

        await this.projectionService.refreshForMessage(client, {
          organizationId: job.organization_id,
          conversationId: job.conversation_id,
          contactId: job.contact_id,
          sentAt
        });

        await this.outboxRepository.markDispatched(client, {
          outboxId: job.id,
          connectorMessageId,
          payload: outbound ?? null
        });

        const autoReplyContext = this.extractAutoReplyContext(job.payload);
        if (autoReplyContext) {
          await client.query(
            `
              update auto_reply_events
              set status = 'sent',
                  metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
              where organization_id = $1
                and outbound_message_id = $2
                and inbound_message_id = $3
            `,
            [
              job.organization_id,
              job.message_id,
              autoReplyContext.inboundMessageId,
              JSON.stringify({ connector_message_id: connectorMessageId })
            ]
          );
        }

        await this.markCampaignRecipientSent(client, job, sentAt);
      });

      return { ok: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to dispatch message";
      const nextAttemptAt = new Date(Date.now() + Math.min(job.attempt_count, 5) * 15000);
      const failure = classifyCampaignSendFailure(error);
      const willRetry = !failure.senderIssue && job.attempt_count < env.MESSAGE_OUTBOX_WORKER_MAX_RETRIES;
      const keepMessagePending = willRetry && isTransientConnectorSessionError(errorMessage);

      await withTransaction(async (client) => {
        if (!keepMessagePending) {
          await this.messageRepository.appendStatusEvent(client, {
            messageId: job.message_id,
            status: "failed",
            payload: { error: errorMessage }
          });

          await this.messageRepository.updateAckStatus(client, {
            messageId: job.message_id,
            ackStatus: "failed",
            failedAt: new Date()
          });
        }

        await this.outboxRepository.markFailed(client, {
          outboxId: job.id,
          errorMessage,
          nextAttemptAt: willRetry ? nextAttemptAt : null,
          payload: { error: errorMessage }
        });

        await this.markCampaignRecipientFailed(client, job, failure, willRetry);
      });

      logger.error({ err: error, outboxId: job.id, messageId: job.message_id }, "Failed to dispatch outbound message");
      return { ok: false, errorMessage };
    }
  }

  async drainOne(outboxId: string) {
    const claimResult = await withTransaction(async (client) => {
      const claimedJob = await this.outboxRepository.claimById(client, {
        outboxId,
        maxRetries: env.MESSAGE_OUTBOX_WORKER_MAX_RETRIES
      });

      if (claimedJob) {
        return { claimedJob, existingJob: null };
      }

      const existingJob = await this.outboxRepository.findById(client, outboxId);
      return { claimedJob: null, existingJob };
    });

    if (claimResult.claimedJob) {
      return this.processJob(claimResult.claimedJob);
    }

    const job = claimResult.existingJob;

    if (!job) {
      return { ok: false as const, errorMessage: "Pending outbound job not found" };
    }

    if (job.processing_status === "processing" || job.processing_status === "dispatched") {
      return { ok: true as const };
    }

    return { ok: false as const, errorMessage: "Pending outbound job is not ready for dispatch" };
  }

  async retryMessage(input: { messageId: string; organizationId: string | null }) {
    const client = await pool.connect();

    try {
      const job = await this.outboxRepository.findRetryableByMessageId(client, {
        messageId: input.messageId,
        organizationId: input.organizationId
      });

      if (!job) {
        const repairedJob = await this.repairPendingDraftByMessageId(client, {
          messageId: input.messageId,
          organizationId: input.organizationId
        });

        if (!repairedJob) {
          return {
            ok: false,
            reason: "Pending outbound job not found"
          };
        }

        const dispatchResult = await this.drainOne(repairedJob.id);

        if (!dispatchResult.ok) {
          return {
            ok: false,
            reason: dispatchResult.errorMessage,
            outboxId: repairedJob.id
          };
        }

        return {
          ok: true,
          outboxId: repairedJob.id
        };
      }

      const dispatchResult = await this.drainOne(job.id);

      if (!dispatchResult.ok) {
        return {
          ok: false,
          reason: dispatchResult.errorMessage,
          outboxId: job.id
        };
      }

      return {
        ok: true,
        outboxId: job.id
      };
    } finally {
      client.release();
    }
  }

  private extractConnectorMessageId(outbound: unknown) {
    if (!outbound || typeof outbound !== "object") {
      return null;
    }

    const key = (outbound as { key?: unknown }).key;

    if (!key || typeof key !== "object") {
      return null;
    }

    const id = (key as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  private async repairOrphanedPendingDrafts(limit: number) {
    const drafts = await withTransaction((client) =>
      this.outboxRepository.listRepairablePendingDrafts(client, limit)
    );

    for (const draft of drafts) {
      await withTransaction((client) => this.enqueuePendingDraftRepair(client, draft));
    }
  }

  private async repairPendingDraftByMessageId(
    client: PoolClient,
    input: { messageId: string; organizationId: string | null }
  ) {
    const draft = await this.outboxRepository.findRepairablePendingDraftByMessageId(client, input);

    if (!draft) {
      return null;
    }

    return this.enqueuePendingDraftRepair(client, draft);
  }

  private async enqueuePendingDraftRepair(client: PoolClient, draft: PendingOutboundDraftRecord) {
    const recipientJid = draft.external_chat_id;

    if (!recipientJid) {
      await this.messageRepository.appendStatusEvent(client, {
        messageId: draft.id,
        status: "failed",
        payload: { error: "Pending outbound message is missing recipient identity" }
      });

      await this.messageRepository.updateAckStatus(client, {
        messageId: draft.id,
        ackStatus: "failed",
        failedAt: new Date()
      });

      return null;
    }

    const source = this.extractDispatchSource(draft.content_json);
    const priority = this.resolveRepairPriority(source);
    const payload = this.buildRepairPayload(draft.content_json, source, priority);

    const repaired = await this.enqueue(client, {
      organizationId: draft.organization_id,
      messageId: draft.id,
      conversationId: draft.conversation_id,
      contactId: draft.contact_id,
      whatsappAccountId: draft.whatsapp_account_id,
      recipientJid,
      messageText: draft.content_text ?? "",
      source,
      priority,
      payload
    });

    await this.messageRepository.appendStatusEvent(client, {
      messageId: draft.id,
      status: "queued",
      payload: {
        repaired: true,
        recipient_jid: recipientJid,
        reason: "missing_dispatch_outbox"
      }
    });

    return repaired;
  }

  private extractDispatchSource(contentJson: unknown): "manual" | "quick_reply" | "campaign" | "system" {
    if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) {
      return "manual";
    }

    return (contentJson as { source?: unknown }).source === "campaign" ? "campaign" : "manual";
  }

  private resolveRepairPriority(source: "manual" | "quick_reply" | "campaign" | "system") {
    switch (source) {
      case "manual":
        return 10;
      case "quick_reply":
        return 8;
      case "campaign":
        return 3;
      default:
        return 5;
    }
  }

  private buildRepairPayload(
    contentJson: unknown,
    source: "manual" | "quick_reply" | "campaign" | "system",
    priority: number
  ) {
    const content = contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
      ? (contentJson as Record<string, unknown>)
      : {};
    const payload: Record<string, unknown> = {
      meta: { source, priority, repaired: true }
    };

    const outboundMedia = content.outboundMedia;
    if (outboundMedia && typeof outboundMedia === "object" && !Array.isArray(outboundMedia)) {
      payload.attachment = outboundMedia;
    }

    const campaign = content.campaign;
    if (source === "campaign" && campaign && typeof campaign === "object" && !Array.isArray(campaign)) {
      (payload.meta as Record<string, unknown>).campaign = campaign;
    }

    return payload;
  }

  private async resolveAttachmentPayload(payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const attachment = (payload as { attachment?: unknown }).attachment;
    return this.mediaAssetService.resolveAttachmentForDispatch(attachment);
  }

  private extractContactCardPayload(payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const contactCard = (payload as { contactCard?: unknown }).contactCard;

    if (!contactCard || typeof contactCard !== "object" || Array.isArray(contactCard)) {
      return null;
    }

    const candidate = contactCard as {
      displayName?: string;
      vcard?: string;
    };

    if (!candidate.displayName || !candidate.vcard) {
      return null;
    }

    return {
      displayName: candidate.displayName,
      vcard: candidate.vcard
    };
  }

  private extractAutoReplyContext(payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const meta = (payload as { meta?: unknown }).meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return null;
    }

    const autoReply = (meta as { autoReply?: unknown }).autoReply;
    if (!autoReply || typeof autoReply !== "object" || Array.isArray(autoReply)) {
      return null;
    }

    const candidate = autoReply as {
      inboundMessageId?: unknown;
      skipIfOutgoingAfter?: unknown;
      triggerType?: unknown;
    };

    if (typeof candidate.inboundMessageId !== "string" || typeof candidate.skipIfOutgoingAfter !== "string") {
      return null;
    }

    return {
      inboundMessageId: candidate.inboundMessageId,
      skipIfOutgoingAfter: candidate.skipIfOutgoingAfter,
      triggerType: typeof candidate.triggerType === "string" ? candidate.triggerType : null
    };
  }

  private async shouldSkipAutoReply(job: MessageDispatchOutboxRecord) {
    const autoReplyContext = this.extractAutoReplyContext(job.payload);
    if (!autoReplyContext) {
      return null;
    }

    const client = await pool.connect();
    try {
      const manualReplyResult = await client.query<{ id: string }>(
        `
          select id
          from messages
          where organization_id = $1
            and conversation_id = $2
            and direction = 'outgoing'
            and id <> $3
            and is_deleted = false
            and coalesce(sent_at, created_at) > $4::timestamptz
          limit 1
        `,
        [job.organization_id, job.conversation_id, job.message_id, autoReplyContext.skipIfOutgoingAfter]
      );

      if (manualReplyResult.rows[0]) {
        return {
          reason: "outgoing_reply_exists",
          inboundMessageId: autoReplyContext.inboundMessageId
        };
      }

      return null;
    } finally {
      client.release();
    }
  }

  private extractCampaignContext(payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const meta = (payload as { meta?: unknown }).meta;

    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return null;
    }

    const campaign = (meta as { campaign?: unknown }).campaign;

    if (!campaign || typeof campaign !== "object" || Array.isArray(campaign)) {
      return null;
    }

    const candidate = campaign as {
      campaignId?: unknown;
      campaignRecipientId?: unknown;
    };

    return typeof candidate.campaignId === "string" && typeof candidate.campaignRecipientId === "string"
      ? {
          campaignId: candidate.campaignId,
          campaignRecipientId: candidate.campaignRecipientId
        }
      : null;
  }

  private async markCampaignRecipientSent(client: PoolClient, job: MessageDispatchOutboxRecord, sentAt: Date) {
    const context = this.extractCampaignContext(job.payload);

    if (!context) {
      return;
    }

    await client.query(
      `
        update campaign_recipients
        set send_status = 'sent',
            sent_at = $4,
            failed_at = null,
            next_attempt_at = null,
            error_message = null,
            failure_code = null,
            failure_reason = null,
            last_attempt_at = coalesce(last_attempt_at, $4)
        where organization_id = $1
          and campaign_id = $2
          and id = $3
      `,
      [job.organization_id, context.campaignId, context.campaignRecipientId, sentAt.toISOString()]
    );

    await this.refreshCampaignCompletion(client, job.organization_id, context.campaignId);
  }

  private async markCampaignRecipientFailed(
    client: PoolClient,
    job: MessageDispatchOutboxRecord,
    failure: { code: string; reason: string; senderIssue: boolean; confirmedBanned: boolean },
    willRetry: boolean
  ) {
    const context = this.extractCampaignContext(job.payload);

    if (!context) {
      return;
    }

    if (willRetry) {
      await client.query(
        `
          update campaign_recipients
          set error_message = $4,
              failure_code = $5,
              failure_reason = $4,
              last_attempt_at = timezone('utc', now())
          where organization_id = $1
            and campaign_id = $2
            and id = $3
            and send_status = 'queued'
        `,
        [job.organization_id, context.campaignId, context.campaignRecipientId, failure.reason, failure.code]
      );

      return;
    }

    await client.query(
      `
        update campaign_recipients
        set send_status = 'failed',
            failed_at = timezone('utc', now()),
            next_attempt_at = null,
            error_message = $4,
            failure_code = $5,
            failure_reason = $4,
            last_attempt_at = timezone('utc', now())
        where organization_id = $1
          and campaign_id = $2
          and id = $3
      `,
      [job.organization_id, context.campaignId, context.campaignRecipientId, failure.reason, failure.code]
    );

    if (failure.senderIssue) {
      await pauseCampaignForSenderIssue({
        organizationId: job.organization_id,
        campaignId: context.campaignId,
        pauseReason: failure.confirmedBanned
          ? "Campaign paused because the selected WhatsApp sender appears to be banned. Replace the sender to resume."
          : "Campaign paused because the selected WhatsApp sender appears to be disconnected, logged out, or unavailable. Reconnect or replace the sender to resume.",
        client
      });
    }

    await CampaignSafetyService.autoPauseCampaignIfNeeded(job.organization_id, context.campaignId);
    await this.refreshCampaignCompletion(client, job.organization_id, context.campaignId);
  }

  private async refreshCampaignCompletion(client: PoolClient, organizationId: string, campaignId: string) {
    await client.query(
      `
        with counts as (
          select
            count(*) filter (where send_status in ('pending', 'queued')) as open_count,
            count(*) filter (
              where send_status = 'failed'
                and attempt_count < $3
            ) as retryable_failed_count,
            count(*) filter (where send_status = 'sent') as sent_count
          from campaign_recipients
          where organization_id = $1
            and campaign_id = $2
        )
        update campaigns
        set status = case
              when counts.open_count = 0 and counts.retryable_failed_count = 0 and counts.sent_count > 0 then 'completed'
              when counts.open_count = 0 and counts.retryable_failed_count = 0 and counts.sent_count = 0 then 'failed'
              else campaigns.status
            end,
            updated_at = timezone('utc', now())
        from counts
        where campaigns.organization_id = $1
          and campaigns.id = $2
          and campaigns.status = 'sending'
      `,
      [organizationId, campaignId, env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES]
    );
  }
}

function isTransientConnectorSessionError(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  if (isSenderIssueFailureCode(classifyCampaignSendFailure(errorMessage).code)) {
    return false;
  }
  return (
    normalized.includes("session is not connected") ||
    normalized.includes("did not reconnect before the send timeout") ||
    normalized.includes("session is not fully connected")
  );
}
