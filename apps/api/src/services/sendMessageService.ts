import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import { sanitizeOutboundMediaReference } from "../lib/mediaAttachments.js";
import { emitMobileInboxUpdate } from "../modules/mobile/mobileInboxEvents.bus.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { WhatsAppAccountAccessRepository } from "../repositories/whatsAppAccountAccessRepository.js";
import type { SendMessageInput, SendMessageOptions } from "../types/domain.js";
import { MediaAssetService } from "./mediaAssetService.js";
import { MessageDispatchService } from "./messageDispatchService.js";
import { ProjectionService } from "./projectionService.js";
import { QuickReplyOutcomeService } from "./quickReplyOutcomeService.js";

export class SendMessageService {
  constructor(
    private readonly messageRepository = new MessageRepository(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly whatsappAccessRepository = new WhatsAppAccountAccessRepository(),
    private readonly mediaAssetService = new MediaAssetService(),
    private readonly messageDispatchService = new MessageDispatchService(),
    private readonly projectionService = new ProjectionService(),
    private readonly quickReplyOutcomeService = new QuickReplyOutcomeService()
  ) {}

  async send(input: SendMessageInput, options: SendMessageOptions = {}) {
    const normalizedText = input.text?.trim() ?? "";
    const hasAttachment = Boolean(input.attachment);

    if (!normalizedText && !hasAttachment) {
      throw new Error("Message text or one attachment is required");
    }

    this.assertConnectorSendIsAllowed();

    const dispatchSource = resolveDispatchSource(input);
    const dispatchPriority = resolveDispatchPriority(dispatchSource);
    const storedAttachment = input.attachment
      ? await this.mediaAssetService.ensureStoredReference({
          organizationId: input.organizationId,
          source: input.campaignContext ? "campaign-outbound" : "message-outbound",
          attachment: input.attachment
        })
      : null;

    const { message, outboxId } = await withTransaction(async (client) => {
      const conversationResult = await client.query<{ contact_id: string; contact_jid: string }>(
        `
          select c.contact_id, ci.wa_jid as contact_jid
          from conversations c
          join contact_identities ci on ci.contact_id = c.contact_id and ci.whatsapp_account_id = c.whatsapp_account_id
          where c.id = $1
            and c.organization_id = $2
            and c.whatsapp_account_id = $3
            and ci.deleted_at is null
          order by
            case when ci.wa_jid like '%@s.whatsapp.net' then 0 else 1 end,
            ci.last_seen_at desc nulls last
          limit 1
        `,
        [input.conversationId, input.organizationId, input.whatsappAccountId]
      );

      const conversationRow = conversationResult.rows[0];
      const recipientJid = conversationRow?.contact_jid;

      if (!recipientJid) {
        throw new Error("Recipient identity not found for conversation");
      }

      await this.assertCanReply(client, input);

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
        ...(storedAttachment
          ? {
              outboundMedia: sanitizeOutboundMediaReference(storedAttachment)
            }
          : {}),
        ...(input.contactCard
          ? {
              contactCard: {
                displayName: input.contactCard.displayName
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
          : {}),
        ...(input.autoReplyContext
          ? {
              source: "auto_reply",
              autoReply: {
                triggerType: input.autoReplyContext.triggerType,
                inboundMessageId: input.autoReplyContext.inboundMessageId,
                skipIfOutgoingAfter: input.autoReplyContext.skipIfOutgoingAfter
              }
            }
          : {}),
        ...(input.campaignContext
          ? {
              source: "campaign",
              campaign: {
                campaignId: input.campaignContext.campaignId,
                campaignRecipientId: input.campaignContext.campaignRecipientId
              }
            }
          : {})
      };

      const messageType = storedAttachment?.kind ?? "text";
      const contentText =
        normalizedText || (storedAttachment ? `${storedAttachment.kind.toUpperCase()}: ${storedAttachment.fileName}` : "");

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
        mediaId: storedAttachment?.mediaId ?? null,
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

      const outboxPayload = {
        ...(storedAttachment
          ? {
              attachment: sanitizeOutboundMediaReference(storedAttachment)
            }
          : {}),
        ...(input.contactCard
          ? {
              contactCard: {
                displayName: input.contactCard.displayName,
                vcard: input.contactCard.vcard
              }
            }
          : {}),
        meta: {
          source: dispatchSource,
          priority: dispatchPriority,
          ...(input.autoReplyContext
            ? {
                autoReply: {
                  triggerType: input.autoReplyContext.triggerType,
                  inboundMessageId: input.autoReplyContext.inboundMessageId,
                  skipIfOutgoingAfter: input.autoReplyContext.skipIfOutgoingAfter
                }
              }
            : {}),
          ...(input.campaignContext
            ? {
                campaign: {
                  campaignId: input.campaignContext.campaignId,
                  campaignRecipientId: input.campaignContext.campaignRecipientId
                }
              }
            : {})
        }
      };

      const outbox = await this.messageDispatchService.enqueue(client, {
        organizationId: input.organizationId,
        messageId: draft.id,
        conversationId: input.conversationId,
        contactId: conversationRow.contact_id,
        whatsappAccountId: input.whatsappAccountId,
        recipientJid,
        messageText: normalizedText || storedAttachment?.fileName || draft.content_text || "",
        source: dispatchSource,
        priority: dispatchPriority,
        availableAt: input.outboxAvailableAt ?? null,
        payload: outboxPayload
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

    if (env.OUTBOUND_DISPATCH_MODE === "worker_only" && !options.waitForDispatch) {
      emitMobileInboxUpdate({
        type: "message_created",
        conversationId: input.conversationId,
        organizationId: input.organizationId
      });
      return message;
    }

    if (options.waitForDispatch) {
      const dispatchResult = await this.messageDispatchService.drainOne(outboxId);

      if (!dispatchResult.ok) {
        throw new AppError(dispatchResult.errorMessage, 502, "message_dispatch_failed", {
          messageId: message.id,
          outboxId
        });
      }
    } else {
      void this.messageDispatchService.drainOne(outboxId).catch((error) => {
        logger.error({ error, outboxId, messageId: message.id }, "Immediate outbound dispatch failed");
      });
    }

    emitMobileInboxUpdate({
      type: "message_created",
      conversationId: input.conversationId,
      organizationId: input.organizationId
    });

    return message;
  }

  private assertConnectorSendIsAllowed() {
    if (env.NODE_ENV !== "development" || env.ALLOW_LOCAL_CONNECTOR_SEND || !isLocalConnectorUrl(env.CONNECTOR_BASE_URL)) {
      return;
    }

    throw new AppError(
      "Local WhatsApp sending is disabled because CONNECTOR_BASE_URL points to localhost. Set CONNECTOR_BASE_URL to the Railway connector for real dev sends, or set ALLOW_LOCAL_CONNECTOR_SEND=true only when the local connector owns a dev WhatsApp session.",
      400,
      "local_connector_send_disabled"
    );
  }

  private async assertCanReply(client: PoolClient, input: SendMessageInput) {
    if (!input.authUser) {
      return;
    }

    if (input.authUser.role === "super_admin" || input.authUser.role === "org_admin" || input.authUser.role === "manager") {
      return;
    }

    const organizationUserId = input.authUser.organizationUserId ?? input.organizationUserId ?? null;

    if (!organizationUserId) {
      throw new AppError("WhatsApp number reply access is required", 403, "whatsapp_account_reply_forbidden");
    }

    const canReply = await this.whatsappAccessRepository.hasPermission(client, {
      organizationId: input.organizationId,
      whatsappAccountId: input.whatsappAccountId,
      organizationUserId,
      permission: "can_reply"
    });

    if (!canReply) {
      throw new AppError("You do not have reply access for this WhatsApp number", 403, "whatsapp_account_reply_forbidden");
    }
  }
}

function resolveDispatchSource(input: SendMessageInput) {
  if (input.campaignContext) {
    return "campaign" as const;
  }

  if (input.quickReplyTemplateId) {
    return "quick_reply" as const;
  }

  return "manual" as const;
}

function resolveDispatchPriority(source: "manual" | "quick_reply" | "campaign") {
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

function isLocalConnectorUrl(value: string) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
