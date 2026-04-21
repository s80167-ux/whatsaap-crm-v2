import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { ProcessedEventKeyRepository } from "../repositories/processedEventKeyRepository.js";
import { RawEventRepository, type RawChannelEventRecord } from "../repositories/rawEventRepository.js";
import { MessageIngestionService } from "./messageIngestionService.js";

type WhatsAppMessageEventPayload = {
  organizationId: string;
  whatsappAccountId: string;
  externalMessageId: string;
  remoteJid: string;
  phoneRaw: string | null;
  profileName: string | null;
  textBody: string | null;
  messageType: string;
  direction: "incoming" | "outgoing";
  sentAt: string;
  rawPayload: unknown;
};

export class RawEventProcessorService {
  constructor(
    private readonly rawEventRepository = new RawEventRepository(),
    private readonly processedEventKeyRepository = new ProcessedEventKeyRepository(),
    private readonly messageIngestionService = new MessageIngestionService()
  ) {}

  private buildEventKey(event: RawChannelEventRecord, payload: WhatsAppMessageEventPayload) {
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

  async processEvent(event: RawChannelEventRecord) {
    const payload = event.payload as WhatsAppMessageEventPayload;

    if (!payload?.externalMessageId || !payload?.remoteJid) {
      await withTransaction((client) => this.rawEventRepository.markIgnored(client, event.id, "Unsupported raw event payload"));
      return;
    }

    const eventKey = this.buildEventKey(event, payload);

    try {
      const shouldProcess = await withTransaction(async (client) => {
        return this.processedEventKeyRepository.createIfAbsent(client, {
          organizationId: event.organization_id,
          source: event.source,
          eventKey
        });
      });

      if (!shouldProcess) {
        await withTransaction((client) => this.rawEventRepository.markIgnored(client, event.id, "Event key already processed"));
        return;
      }

      await this.messageIngestionService.ingest({
        organizationId: payload.organizationId,
        whatsappAccountId: payload.whatsappAccountId,
        externalMessageId: payload.externalMessageId,
        remoteJid: payload.remoteJid,
        phoneRaw: payload.phoneRaw,
        profileName: payload.profileName,
        textBody: payload.textBody,
        messageType: payload.messageType,
        direction: payload.direction,
        sentAt: new Date(payload.sentAt),
        rawPayload: payload.rawPayload
      });

      await withTransaction((client) => this.rawEventRepository.markProcessed(client, event.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process raw event";
      await withTransaction((client) => this.rawEventRepository.markFailed(client, event.id, message));
      logger.error({ error, rawEventId: event.id }, "Failed to process raw event");
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
