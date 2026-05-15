import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { NotificationsService } from "../modules/notifications/notifications.service.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import type { InboundMessageInput } from "../types/domain.js";
import { normalizeMessageType } from "../utils/message.js";
import { ContactService } from "./contactService.js";
import { ConversationService } from "./conversationService.js";
import { ProjectionService } from "./projectionService.js";
import { QuickReplyOutcomeService } from "./quickReplyOutcomeService.js";

export class MessageIngestionService {
  constructor(
    private readonly contactService = new ContactService(),
    private readonly conversationService = new ConversationService(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly messageRepository = new MessageRepository(),
    private readonly projectionService = new ProjectionService(),
    private readonly quickReplyOutcomeService = new QuickReplyOutcomeService(),
    private readonly notificationsService = new NotificationsService()
  ) {}

  async ingest(input: InboundMessageInput) {
    return withTransaction(async (client) => {
      const { contact, identity } = await this.contactService.findOrCreateCanonicalContact(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        whatsappJid: input.remoteJid,
        phoneRaw: input.phoneRaw,
        profileName: input.profileName,
        profilePushName: input.profilePushName ?? null,
        profileAvatarUrl: input.profileAvatarUrl ?? null
      });

      const conversation = await this.conversationService.findOrCreateConversation(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        contactId: contact.id
      });

      if (input.direction === "outgoing") {
        const existingOutbound = await this.messageRepository.findByExternalMessageId(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          externalMessageId: input.externalMessageId
        });
        const queuedDraft = existingOutbound
          ? null
          : await this.messageRepository.findRecentQueuedOutboundDraft(client, {
              organizationId: input.organizationId,
              conversationId: conversation.id,
              contactId: contact.id,
              whatsappAccountId: input.whatsappAccountId,
              externalChatId: input.remoteJid,
              contentText: input.textBody,
              sentAt: input.sentAt
            });

        if (queuedDraft) {
          await this.messageRepository.updateOutboundDispatch(client, {
            messageId: queuedDraft.id,
            externalMessageId: input.externalMessageId,
            externalChatId: input.remoteJid,
            rawPayload: input.rawPayload,
            sentAt: input.sentAt
          });

          await this.messageRepository.appendStatusEvent(client, {
            messageId: queuedDraft.id,
            status: "server_ack",
            payload: {
              linked_from_message_upsert: true,
              external_message_id: input.externalMessageId
            }
          });

          await this.messageRepository.updateAckStatus(client, {
            messageId: queuedDraft.id,
            ackStatus: "server_ack"
          });

          await this.projectionService.refreshForMessage(client, {
            organizationId: input.organizationId,
            conversationId: conversation.id,
            contactId: contact.id,
            sentAt: input.sentAt
          });

          return { contact, identity, conversation, message: queuedDraft, inserted: false };
        }
      }

      const { message, inserted } = await this.messageRepository.insertIfAbsent(client, {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        whatsappAccountId: input.whatsappAccountId,
        externalMessageId: input.externalMessageId,
        externalChatId: input.remoteJid,
        direction: input.direction,
        messageType: normalizeMessageType(input.messageType),
        contentText: input.textBody,
        rawPayload: input.rawPayload,
        sentAt: input.sentAt,
        ackStatus: input.direction === "outgoing" ? "server_ack" : undefined
      });

      if (inserted) {
        await this.conversationRepository.bumpLastMessage(client, {
          conversationId: conversation.id,
          direction: input.direction,
          sentAt: input.sentAt,
          incrementUnread: input.direction === "incoming"
        });
      }

      await this.projectionService.refreshForMessage(client, {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        sentAt: input.sentAt
      });

      if (inserted && input.direction === "incoming") {
        await this.quickReplyOutcomeService.markCustomerReply(client, {
          organizationId: input.organizationId,
          conversationId: conversation.id,
          responseMessageId: message.id,
          responseAt: input.sentAt
        });

        try {
          const contactLabel =
            contact.display_name || contact.primary_phone_normalized || contact.primary_phone_e164 || input.profileName || "Customer";
          const messagePreview =
            input.textBody && input.textBody.trim().length > 0
              ? input.textBody.trim().slice(0, 160)
              : `New ${normalizeMessageType(input.messageType)} message`;

          const notificationId = await this.notificationsService.createOrUpdate(client, {
            organizationId: input.organizationId,
            recipientOrgUserId: conversation.assigned_user_id ?? null,
            type: "inbound_message",
            title: `New chat from ${contactLabel}`,
            message: messagePreview,
            targetPath: `/inbox?organization_id=${encodeURIComponent(input.organizationId)}&conversationId=${encodeURIComponent(conversation.id)}`,
            targetEntityType: "conversation",
            targetEntityId: conversation.id,
            uniqueKey: `inbound_message:conversation:${conversation.id}`,
            metadata: {
              contactId: contact.id,
              messageId: message.id,
              messageCount: 1
            }
          });
          logger.info(
            {
              notificationId,
              organizationId: input.organizationId,
              conversationId: conversation.id,
              recipientOrgUserId: conversation.assigned_user_id ?? null
            },
            "Created inbound message notification"
          );
        } catch (error) {
          logger.error({ err: error, conversationId: conversation.id }, "Failed to create inbound message notification");
        }
      }

      return { contact, identity, conversation, message, inserted };
    });
  }
}
