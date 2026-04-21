import { withTransaction } from "../config/database.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";

export class RawEventIngestionService {
  constructor(private readonly rawEventRepository = new RawEventRepository()) {}

  async enqueueMessageEvent(input: {
    organizationId: string;
    whatsappAccountId: string;
    externalMessageId: string;
    remoteJid: string;
    phoneRaw: string | null;
    profileName: string | null;
    textBody: string | null;
    messageType: string;
    direction: "incoming" | "outgoing";
    sentAt: Date;
    rawPayload: unknown;
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
          textBody: input.textBody,
          messageType: input.messageType,
          direction: input.direction,
          sentAt: input.sentAt.toISOString(),
          rawPayload: input.rawPayload
        }
      })
    );
  }
}
