import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { NotificationsService } from "../modules/notifications/notifications.service.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import type { InboundMessageInput } from "../types/domain.js";
import { normalizeMessageType } from "../utils/message.js";
import { isWeakDisplayName } from "../utils/contactIdentity.js";
import { mergeContactWithoutDowngrade, hasRecoveryMergeChanges } from "../utils/contactRecoveryMerge.js";
import { normalizeWhatsAppIdentity } from "../utils/whatsappIdentity.js";
import { ContactEnrichmentCacheService } from "./contactEnrichmentCacheService.js";
import { ContactRecoveryAuditService } from "./contactRecoveryAuditService.js";
import { ContactService } from "./contactService.js";
import { ContactRepairProposalService } from "./contactRepairProposalService.js";
import { ConversationService } from "./conversationService.js";
import { ProfilePictureRecoveryService } from "./profilePictureRecoveryService.js";
import { ProjectionService } from "./projectionService.js";
import { QuickReplyOutcomeService } from "./quickReplyOutcomeService.js";

function buildStoredMessageContent(rawPayload: unknown, mediaAttachment: InboundMessageInput["mediaAttachment"]) {
  if (!mediaAttachment) {
    return rawPayload;
  }

  return {
    rawPayload,
    outboundMedia: mediaAttachment
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function hasStoredMediaAttachment(contentJson: unknown) {
  const root = asRecord(contentJson);
  const outboundMedia = asRecord(root?.outboundMedia);

  return Boolean(
    outboundMedia &&
      typeof outboundMedia.kind === "string" &&
      typeof outboundMedia.mimeType === "string" &&
      typeof outboundMedia.dataBase64 === "string" &&
      outboundMedia.dataBase64.length > 0
  );
}

export class MessageIngestionService {
  constructor(
    private readonly contactService = new ContactService(),
    private readonly conversationService = new ConversationService(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly messageRepository = new MessageRepository(),
    private readonly projectionService = new ProjectionService(),
    private readonly quickReplyOutcomeService = new QuickReplyOutcomeService(),
    private readonly notificationsService = new NotificationsService(),
    private readonly enrichmentCacheService = new ContactEnrichmentCacheService(),
    private readonly recoveryAuditService = new ContactRecoveryAuditService(),
    private readonly profilePictureRecoveryService = new ProfilePictureRecoveryService()
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

      const normalizedIdentity = normalizeWhatsAppIdentity(input.remoteJid);
      await this.enrichmentCacheService.updateLastKnownGood(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        contactId: contact.id,
        rawJid: input.remoteJid,
        normalizedJid: normalizedIdentity.normalizedJid,
        lid: normalizedIdentity.lid,
        phoneNumber: input.phoneRaw ?? normalizedIdentity.phoneNumber,
        displayName: input.profileName ?? input.profilePushName ?? null,
        pushName: input.profilePushName ?? null,
        verifiedName: input.profileName ?? null,
        profilePicUrl: input.profileAvatarUrl ?? null,
        source: "live_message",
        rawPayload: input.rawPayload
      });

      if (!contact.primary_phone_normalized || !contact.primary_avatar_url || isWeakDisplayName(contact.display_name)) {
        const restored = await this.enrichmentCacheService.restoreFromLastKnownGood(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          contactId: contact.id,
          normalizedJid: normalizedIdentity.normalizedJid,
          phoneNumber: input.phoneRaw ?? normalizedIdentity.phoneNumber,
          lid: normalizedIdentity.lid
        });

        if (restored) {
          const merged = mergeContactWithoutDowngrade(contact, {
            displayName: restored.best_display_name ?? restored.best_verified_name ?? restored.best_push_name ?? restored.best_notify_name ?? null,
            phoneNumber: restored.phone_number ?? null,
            profilePicUrl: restored.best_profile_pic_url ?? null
          });

          if (hasRecoveryMergeChanges(contact, merged)) {
            await client.query(
              `
                update contacts
                set display_name = $3,
                    primary_phone_e164 = $4,
                    primary_phone_normalized = $5,
                    primary_avatar_url = $6,
                    company_name = $7,
                    updated_at = timezone('utc', now())
                where id = $1
                  and organization_id = $2
              `,
              [
                contact.id,
                input.organizationId,
                merged.display_name,
                merged.primary_phone_e164,
                merged.primary_phone_normalized,
                merged.primary_avatar_url,
                merged.company_name
              ]
            );

            await this.recoveryAuditService.record(client, {
              organizationId: input.organizationId,
              whatsappAccountId: input.whatsappAccountId,
              contactId: contact.id,
              action: "restored_from_cache",
              source: "last_known_good_cache",
              confidenceScore: restored.confidence_score ?? null,
              beforeData: contact,
              afterData: merged,
              reason: "Incoming WhatsApp payload was incomplete; restored safe fields from last known good cache"
            });
          }
        }
      }

      if (!contact.primary_avatar_url && normalizedIdentity.normalizedJid) {
        await this.profilePictureRecoveryService.queueProfilePictureFetch(client, {
          organizationId: input.organizationId,
          whatsappAccountId: input.whatsappAccountId,
          contactId: contact.id,
          jid: normalizedIdentity.normalizedJid
        });
      }

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
        rawPayload: buildStoredMessageContent(input.rawPayload, input.mediaAttachment ?? null),
        sentAt: input.sentAt,
        ackStatus: input.direction === "outgoing" ? "server_ack" : undefined
      });

      if (!inserted && input.direction === "incoming" && input.mediaAttachment && !hasStoredMediaAttachment(message.content_json)) {
        await this.messageRepository.updateInboundMediaAttachment(client, {
          messageId: message.id,
          mediaAttachment: input.mediaAttachment
        });
      }

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

      try {
        if (
          !contact.primary_phone_normalized ||
          identity.identity_quality === "weak" ||
          identity.identity_quality === "lid_only" ||
          isWeakDisplayName(contact.display_name)
        ) {
          await ContactRepairProposalService.detectWeakIdentityForContact(client, {
            organizationId: input.organizationId,
            contactId: contact.id
          });
        }
      } catch (error) {
        logger.warn({ err: error, contactId: contact.id }, "Failed to create weak contact identity repair proposal");
      }

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
