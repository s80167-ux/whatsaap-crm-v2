import crypto from "node:crypto";
import { withTransaction } from "../config/database.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import type { SendMessageInput } from "../types/domain.js";
import { MessageDispatchService } from "./messageDispatchService.js";
import { ProjectionService } from "./projectionService.js";

export class SendMessageService {
  constructor(
    private readonly messageRepository = new MessageRepository(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly messageDispatchService = new MessageDispatchService(),
    private readonly projectionService = new ProjectionService()
  ) {}

  async send(input: SendMessageInput) {
    const normalizedText = input.text?.trim() ?? "";
    const hasAttachment = Boolean(input.attachment);

    if (!normalizedText && !hasAttachment) {
      throw new Error("Message text or one attachment is required");
    }

    const message = await withTransaction(async (client) => {
      const conversationResult = await client.query<{ contact_id: string; contact_jid: string }>(
        `
          select c.contact_id, ci.wa_jid as contact_jid
          from conversations c
          join contact_identities ci on ci.contact_id = c.contact_id and ci.whatsapp_account_id = c.whatsapp_account_id
          where c.id = $1
            and c.organization_id = $2
            and c.whatsapp_account_id = $3
          limit 1
        `,
        [input.conversationId, input.organizationId, input.whatsappAccountId]
      );

      const conversationRow = conversationResult.rows[0];
      const recipientJid = conversationRow?.contact_jid;

      if (!recipientJid) {
        throw new Error("Recipient identity not found for conversation");
      }

      const queuedAt = new Date();
      const attachmentMetadata = input.attachment
        ? {
            outboundMedia: {
              kind: input.attachment.kind,
              fileName: input.attachment.fileName,
              mimeType: input.attachment.mimeType,
              fileSizeBytes: input.attachment.fileSizeBytes
            }
          }
        : null;

      const messageType = input.attachment?.kind ?? "text";
      const contentText =
        normalizedText || (input.attachment ? `${input.attachment.kind.toUpperCase()}: ${input.attachment.fileName}` : "");

      const draft = await this.messageRepository.createOutboundDraft(client, {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        contactId: conversationRow.contact_id,
        whatsappAccountId: input.whatsappAccountId,
        externalMessageId: `queued:${crypto.randomUUID()}`,
        externalChatId: recipientJid,
        contentText,
        messageType,
        contentJson: attachmentMetadata,
        sentAt: queuedAt
      });

      await this.messageRepository.appendStatusEvent(client, {
        messageId: draft.id,
        status: "queued",
        payload: {
          recipient_jid: recipientJid
        }
      });

      await this.messageDispatchService.enqueue(client, {
        organizationId: input.organizationId,
        messageId: draft.id,
        conversationId: input.conversationId,
        contactId: conversationRow.contact_id,
        whatsappAccountId: input.whatsappAccountId,
        recipientJid,
        messageText: normalizedText || input.attachment?.fileName || draft.content_text || "",
        payload: input.attachment
          ? {
              attachment: {
                kind: input.attachment.kind,
                fileName: input.attachment.fileName,
                mimeType: input.attachment.mimeType,
                dataBase64: input.attachment.dataBase64
              }
            }
          : null
      });

      await this.conversationRepository.bumpLastMessage(client, {
        conversationId: input.conversationId,
        direction: "outgoing",
        sentAt: queuedAt,
        incrementUnread: false
      });

      await this.projectionService.refreshForMessage(client, {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        contactId: conversationRow.contact_id,
        sentAt: queuedAt
      });

      return draft;
    });

    return message;
  }
}
