import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { ProcessedEventKeyRepository } from "../repositories/processedEventKeyRepository.js";
import { RawEventRepository, type RawChannelEventRecord } from "../repositories/rawEventRepository.js";
import { bestPhoneFromWhatsAppPayload, isWhatsAppDirectChatJid } from "../utils/phone.js";
import { MessageStatusSyncService } from "./messageStatusSyncService.js";
import { MessageIngestionService } from "./messageIngestionService.js";

type WhatsAppMessageEventPayload = {
  organizationId: string;
  whatsappAccountId: string;
  externalMessageId: string;
  remoteJid: string;
  phoneRaw: string | null;
  profileName: string | null;
  profilePushName?: string | null;
  profileAvatarUrl?: string | null;
  textBody: string | null;
  messageType: string;
  direction: "incoming" | "outgoing";
  sentAt: string;
  rawPayload: unknown;
};

type WhatsAppMessageStatusEventPayload = {
  organizationId: string;
  whatsappAccountId: string;
  externalMessageId: string;
  remoteJid: string;
  ackStatus: "pending" | "server_ack" | "device_delivered" | "read" | "played" | "failed";
  eventAt: string;
  rawPayload: unknown;
};

export class RawEventProcessorService {
  constructor(
    private readonly rawEventRepository = new RawEventRepository(),
    private readonly processedEventKeyRepository = new ProcessedEventKeyRepository(),
    private readonly messageIngestionService = new MessageIngestionService(),
    private readonly messageStatusSyncService = new MessageStatusSyncService()
  ) {}

  private buildMessageEventKey(event: RawChannelEventRecord, payload: WhatsAppMessageEventPayload) {
    return createHash("sha256")
      .update(
        [
          event.organization_id,
          event.whatsapp_account_id,
          event.source,
          event.event_type,
          payload.externalMessageId,
          payload.remoteJid,
          payload.direction
        ].join(":")
      )
      .digest("hex");
  }

  private buildMessageStatusEventKey(event: RawChannelEventRecord, payload: WhatsAppMessageStatusEventPayload) {
    return createHash("sha256")
      .update(
        [
          event.organization_id,
          event.whatsapp_account_id,
          event.source,
          event.event_type,
          payload.externalMessageId,
          payload.ackStatus,
          payload.eventAt
        ].join(":")
      )
      .digest("hex");
  }

  private parseEventDate(value: string, context: { rawEventId: string; eventType: string }) {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid event timestamp for ${context.eventType}: ${value} (raw event ${context.rawEventId})`);
    }

    return parsed;
  }

  async processEvent(event: RawChannelEventRecord) {
    if (event.event_type === "message.status") {
      const payload = event.payload as WhatsAppMessageStatusEventPayload;

      if (!payload?.externalMessageId || !payload?.ackStatus || !payload?.eventAt) {
        await withTransaction((client) =>
          this.rawEventRepository.markIgnored(client, event.id, "Unsupported raw status event payload")
        );
        return;
      }

      const eventKey = this.buildMessageStatusEventKey(event, payload);

      try {
        const eventAt = this.parseEventDate(payload.eventAt, {
          rawEventId: event.id,
          eventType: event.event_type
        });

        const status = await withTransaction(async (client) => {
          const shouldProcess = await this.processedEventKeyRepository.createIfAbsent(client, {
            organizationId: event.organization_id,
            source: event.source,
            eventKey
          });

          if (!shouldProcess) {
            await this.rawEventRepository.markIgnored(client, event.id, "Event key already processed");
            return "ignored" as const;
          }

          await this.messageStatusSyncService.apply(client, {
            organizationId: payload.organizationId,
            whatsappAccountId: payload.whatsappAccountId,
            externalMessageId: payload.externalMessageId,
            ackStatus: payload.ackStatus,
            eventAt,
            rawPayload: payload.rawPayload
          });

          await this.rawEventRepository.markProcessed(client, event.id);
          return "processed" as const;
        });

        if (status === "ignored") {
          return;
        }

        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to process raw status event";
        await withTransaction((client) => this.rawEventRepository.markFailed(client, event.id, message));
        logger.error({ err: error, rawEventId: event.id }, "Failed to process raw status event");
        return;
      }
    }

    const payload = event.payload as WhatsAppMessageEventPayload;

    if (!payload?.externalMessageId || !payload?.remoteJid) {
      await withTransaction((client) => this.rawEventRepository.markIgnored(client, event.id, "Unsupported raw event payload"));
      return;
    }

    if (!isWhatsAppDirectChatJid(payload.remoteJid)) {
      await withTransaction((client) =>
        this.rawEventRepository.markIgnored(client, event.id, `Unsupported WhatsApp chat target: ${payload.remoteJid}`)
      );
      return;
    }

    const eventKey = this.buildMessageEventKey(event, payload);

    try {
      const sentAt = this.parseEventDate(payload.sentAt, {
        rawEventId: event.id,
        eventType: event.event_type
      });

      const status = await withTransaction(async (client) => {
        const shouldProcess = await this.processedEventKeyRepository.createIfAbsent(client, {
          organizationId: event.organization_id,
          source: event.source,
          eventKey
        });

        if (!shouldProcess) {
          await this.rawEventRepository.markIgnored(client, event.id, "Event key already processed");
          return "ignored" as const;
        }

        const payloadPhone = bestPhoneFromWhatsAppPayload(payload.rawPayload);
        const phoneRaw = payloadPhone?.startsWith("+60") ? payloadPhone : payload.phoneRaw ?? payloadPhone;

        await this.messageIngestionService.ingest({
          organizationId: payload.organizationId,
          whatsappAccountId: payload.whatsappAccountId,
          externalMessageId: payload.externalMessageId,
          remoteJid: payload.remoteJid,
          phoneRaw,
          profileName: payload.profileName,
          profilePushName: payload.profilePushName ?? null,
          profileAvatarUrl: payload.profileAvatarUrl ?? null,
          textBody: payload.textBody,
          messageType: payload.messageType,
          direction: payload.direction,
          sentAt,
          rawPayload: payload.rawPayload
        });

        await this.rawEventRepository.markProcessed(client, event.id);
        return "processed" as const;
      });

      if (status === "ignored") {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process raw event";
      await withTransaction((client) => this.rawEventRepository.markFailed(client, event.id, message));
      logger.error({ err: error, rawEventId: event.id }, "Failed to process raw event");
    }
  }

  async processPendingBatch(limit = 20) {
    const staleBefore = new Date(Date.now() - env.RAW_EVENT_WORKER_STALE_AFTER_MS);

    await withTransaction((client) => this.rawEventRepository.resetStaleProcessing(client, staleBefore));
    const claimed = await withTransaction((client) =>
      this.rawEventRepository.claimPendingBatch(client, limit, env.RAW_EVENT_WORKER_MAX_RETRIES)
    );

    for (const event of claimed) {
      await this.processEvent(event);
    }

    return claimed.length;
  }

  async processEventById(eventId: string) {
    const client = await pool.connect();
    let event: RawChannelEventRecord | null = null;

    try {
      event = await this.rawEventRepository.findById(client, eventId);
    } finally {
      client.release();
    }

    if (!event) {
      return false;
    }

    await this.processEvent(event);
    return true;
  }
}
