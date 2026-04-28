import crypto from "node:crypto";
import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import type { SendMessageInput } from "../types/domain.js";
import { MessageDispatchService } from "./messageDispatchService.js";
import { ProjectionService } from "./projectionService.js";
import { QuickReplyOutcomeService } from "./quickReplyOutcomeService.js";

export class SendMessageService {
  constructor(
    private readonly messageRepository = new MessageRepository(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly messageDispatchService = new MessageDispatchService(),
    private readonly projectionService = new ProjectionService(),
    private readonly quickReplyOutcomeService = new QuickReplyOutcomeService()
  ) {}

  async send(input: SendMessageInput) {
    const normalizedText = input.text?.trim() ?? "";
    const hasAttachment = Boolean(input.attachment);

    if (!normalizedText && !hasAttachment) {
      throw new Error("Message text or one attachment is required");
    }

    const { message, outboxId } = await withTransaction(async (client) => {
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

      let replyContextMessage:
        | {
            id: string;
            conversation_id: string;
            direction: string;
            content_text: string | null;
            message_type: string;
          }
        | null = null;

      if (input.replyToMessageId) {
        const replyTarget = await this.messageRepository.findById(client, {
          organizationId: input.organizationId,
          messageId: input.replyToMessageId
        });

        if (!replyTarget) {
          throw new Error("Reply target message not found");
        }

        if (replyTarget.conversation_id !== input.conversationId) {
          throw new Error("Reply target must belong to the same conversation");
        }

        replyContextMessage = {
          id: replyTarget.id,
          conversation_id: replyTarget.conversation_id,
          direction: replyTarget.direction,
          content_text: replyTarget.content_text,
          message_type: replyTarget.message_type
        };
      }

      const queuedAt = new Date();
      const contentJson = {
        ...(input.attachment
          ? {
              outboundMedia: {
                kind: input.attachment.kind,
                fileName: input.attachment.fileName,
                mimeType: input.attachment.mimeType,
                fileSizeBytes: input.attachment.fileSizeBytes,
                dataBase64: input.attachment.dataBase64
              }
            }
          : {}),
        ...(replyContextMessage
          ? {
              replyContext: {
                messageId: replyContextMessage.id,
                direction: replyContextMessage.direction,
                messageType: replyContextMessage.message_type,
                previewText: replyContextMessage.content_text
              }
            }
          : {}),
        ...(input.forwardedFromMessageId
          ? {
              forwardedFrom: {
                messageId: input.forwardedFromMessageId
              }
            }
          : {})
      };

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
        replyToMessageId: input.replyToMessageId ?? null,
        contentText,
        messageType,
        contentJson: Object.keys(contentJson).length > 0 ? contentJson : null,
        sentAt: queuedAt
      });

      await this.messageRepository.appendStatusEvent(client, {
        messageId: draft.id,
        status: "queued",
        payload: {
          recipient_jid: recipientJid
        }
      });

      const outbox = await this.messageDispatchService.enqueue(client, {
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

      if (input.quickReplyTemplateId) {
        await this.quickReplyOutcomeService.recordTemplateSend(client, {
          organizationId: input.organizationId,
          quickReplyTemplateId: input.quickReplyTemplateId,
          messageId: draft.id,
          conversationId: input.conversationId,
          contactId: conversationRow.contact_id,
          whatsappAccountId: input.whatsappAccountId,
          usedByOrganizationUserId: input.organizationUserId ?? null
        });
      }

      return {
  message: draft,
  outboxId: outbox.id
};
    });

    void this.messageDispatchService.drainOne(outboxId).catch((error) => {
  logger.error({ error, outboxId, messageId: message.id }, "Immediate outbound dispatch failed");
});
    return message;
  }
}
