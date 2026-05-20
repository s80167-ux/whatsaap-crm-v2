import { withTransaction } from "../config/database.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";

type InboundMediaAttachmentInput = {
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  dataBase64: string;
  fileSizeBytes: number;
};

export class RawEventIngestionService {
  constructor(private readonly rawEventRepository = new RawEventRepository()) {}

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
    mediaAttachment?: InboundMediaAttachmentInput | null;
  }) {
    return withTransaction((client) =>
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
          rawPayload: input.rawPayload,
          mediaAttachment: input.mediaAttachment ?? null
        }
      })
    );
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
    return withTransaction((client) =>
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
  }

  async enqueueContactSnapshotEvent(input: {
    organizationId: string;
    whatsappAccountId: string;
    chats?: unknown[];
    contacts?: unknown[];
    messages?: unknown[];
    syncType?: string | null;
    eventAt?: Date;
  }) {
    const eventAt = input.eventAt ?? new Date();
    return withTransaction((client) =>
      this.rawEventRepository.enqueue(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        source: "whatsapp",
        eventType: "contact.snapshot",
        externalEventId: `${input.whatsappAccountId}:${eventAt.getTime()}:contact.snapshot`,
        eventTimestamp: eventAt,
        payload: {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          chats: input.chats ?? [],
          contacts: input.contacts ?? [],
          messages: input.messages ?? [],
          syncType: input.syncType ?? "baileys_snapshot"
        }
      })
    );
  }
}
