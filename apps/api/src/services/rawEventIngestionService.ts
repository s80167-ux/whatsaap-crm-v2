import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";
import { RawEventProcessorService } from "./rawEventProcessorService.js";

export class RawEventIngestionService {
  constructor(
    private readonly rawEventRepository = new RawEventRepository(),
    private readonly rawEventProcessorService = new RawEventProcessorService()
  ) {}

  async enqueueMessageEvent(input: {
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
    sentAt: Date;
    rawPayload: unknown;
  }) {
    const rawEvent = await withTransaction((client) =>
      this.rawEventRepository.enqueue(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        source: "whatsapp",
        eventType: "message.upsert",
        externalEventId: input.externalMessageId,
        eventTimestamp: input.sentAt,
        payload: {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          externalMessageId: input.externalMessageId,
          remoteJid: input.remoteJid,
          phoneRaw: input.phoneRaw,
          profileName: input.profileName,
          profilePushName: input.profilePushName ?? null,
          profileAvatarUrl: input.profileAvatarUrl ?? null,
          textBody: input.textBody,
          messageType: input.messageType,
          direction: input.direction,
          sentAt: input.sentAt.toISOString(),
          rawPayload: input.rawPayload
        }
      })
    );

    void this.rawEventProcessorService.processEventById(rawEvent.id).catch((error) => {
      logger.error({ error, rawEventId: rawEvent.id }, "Failed to process raw event asynchronously");
    });

    return rawEvent;
  }

  async enqueueMessageStatusEvent(input: {
    organizationId: string;
    whatsappAccountId: string;
    externalMessageId: string;
    remoteJid: string;
    ackStatus: "pending" | "server_ack" | "device_delivered" | "read" | "played" | "failed";
    eventAt: Date;
    rawPayload: unknown;
  }) {
    const rawEvent = await withTransaction((client) =>
      this.rawEventRepository.enqueue(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        source: "whatsapp",
        eventType: "message.status",
        externalEventId: input.externalMessageId,
        eventTimestamp: input.eventAt,
        payload: {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          externalMessageId: input.externalMessageId,
          remoteJid: input.remoteJid,
          ackStatus: input.ackStatus,
          eventAt: input.eventAt.toISOString(),
          rawPayload: input.rawPayload
        }
      })
    );

    void this.rawEventProcessorService.processEventById(rawEvent.id).catch((error) => {
      logger.error({ error, rawEventId: rawEvent.id }, "Failed to process raw status event asynchronously");
    });

    return rawEvent;
  }
}
