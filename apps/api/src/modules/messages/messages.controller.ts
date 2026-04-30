import type { Request, Response } from "express";
import { z } from "zod";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AppError } from "../../lib/errors.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { MessageDispatchService } from "../../services/messageDispatchService.js";
import { QueryService } from "../../services/queryService.js";
import { SendMessageService } from "../../services/sendMessageService.js";
import { withTransaction } from "../../config/database.js";
import { MessageRepository } from "../../repositories/messageRepository.js";

const queryService = new QueryService();
const sendMessageService = new SendMessageService();
const auditLogService = new AuditLogService();
const messageDispatchService = new MessageDispatchService();
const messageRepository = new MessageRepository();

const attachmentSchema = z.object({
  kind: z.enum(["image", "video", "audio", "document"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  dataBase64: z.string().min(1),
  fileSizeBytes: z.number().int().positive().max(4 * 1024 * 1024)
});

const sendSchema = z.object({
  whatsappAccountId: z.string().uuid(),
  conversationId: z.string().uuid(),
  quickReplyTemplateId: z.string().uuid().optional().nullable(),
  replyToMessageId: z.string().uuid().optional().nullable(),
  text: z.string().trim().max(4000).optional(),
  attachment: attachmentSchema.optional().nullable()
}).refine((input) => Boolean(input.text?.trim()) || Boolean(input.attachment), {
  message: "Message text or one attachment is required",
  path: ["text"]
});

const messageParamsSchema = z.object({
  messageId: z.string().uuid()
});

const forwardSchema = z.object({
  targetConversationId: z.string().uuid()
});

const conversationParamsSchema = z.object({
  conversation_id: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const organizationBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable()
});

function requireOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = request.auth?.organizationId ?? organization_id ?? "";

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return organizationId;
}

function requireOrganizationIdFromRequest(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const body = organizationBodySchema.safeParse(request.body ?? {});
  const bodyOrganizationId = body.success
    ? body.data.organizationId ?? body.data.organization_id ?? ""
    : "";
  const organizationId = request.auth?.organizationId ?? bodyOrganizationId ?? organization_id ?? "";

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return organizationId;
}

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getMessages(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const { conversation_id } = conversationParamsSchema.parse(request.params);
  const messages = await queryService.listMessages(auth, organizationId, conversation_id);
  return response.json({ data: messages });
}

export async function sendWhatsAppMessage(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = sendSchema.parse(request.body);
  const bodyOrganizationId =
    typeof request.body?.organizationId === "string"
      ? request.body.organizationId
      : typeof request.body?.organization_id === "string"
        ? request.body.organization_id
        : "";

  const organizationId = auth.organizationId ?? bodyOrganizationId;

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const message = await sendMessageService.send({
    ...input,
    organizationId,
    organizationUserId: auth.organizationUserId ?? null
  });

  await auditLogService.record(auth, {
    organizationId,
    action: "message.sent",
    entityType: "message",
    entityId: message.id,
    metadata: {
      conversation_id: input.conversationId,
      whatsapp_account_id: input.whatsappAccountId,
      quick_reply_template_id: input.quickReplyTemplateId ?? null,
      reply_to_message_id: input.replyToMessageId ?? null,
      external_message_id: message.external_message_id,
      message_type: input.attachment?.kind ?? "text",
      attachment_file_name: input.attachment?.fileName ?? null
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: message });
}

export async function deleteMessage(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { messageId } = messageParamsSchema.parse(request.params);

  const deletedMessage = await withTransaction(async (client) => {
    const requestedOrganizationId = (() => {
      try {
        return requireOrganizationIdFromRequest(request);
      } catch (error) {
        if (auth.role === "super_admin" && error instanceof AppError && error.code === "organization_required") {
          return null;
        }

        throw error;
      }
    })();

    const existingMessage = requestedOrganizationId
      ? await messageRepository.findById(client, {
          organizationId: requestedOrganizationId,
          messageId
        })
      : auth.role === "super_admin"
        ? await messageRepository.findByIdAnyOrganization(client, {
            messageId
          })
        : null;

    if (!existingMessage) {
      throw new AppError("Message not found", 404, "message_not_found");
    }

    const organizationId = existingMessage.organization_id;

    return messageRepository.markDeleted(client, {
      organizationId,
      messageId
    });
  });

  if (!deletedMessage) {
    throw new AppError("Message not found", 404, "message_not_found");
  }

  await auditLogService.record(auth, {
    organizationId: deletedMessage.organization_id,
    action: "message.deleted",
    entityType: "message",
    entityId: deletedMessage.id,
    metadata: {
      conversation_id: deletedMessage.conversation_id,
      whatsapp_account_id: deletedMessage.whatsapp_account_id
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function forwardMessage(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { messageId } = messageParamsSchema.parse(request.params);
  const input = forwardSchema.parse(request.body);
  const organizationId = requireOrganizationIdFromRequest(request);

  const sourceMessage = await withTransaction(async (client) => {
    const existingMessage = await messageRepository.findById(client, {
      organizationId,
      messageId
    });

    if (!existingMessage) {
      throw new AppError("Message not found", 404, "message_not_found");
    }

    return existingMessage;
  });

  const targetConversation = await withTransaction(async (client) => {
    const result = await client.query<{ id: string; whatsapp_account_id: string }>(
      `
        select id, whatsapp_account_id
        from conversations
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [organizationId, input.targetConversationId]
    );

    return result.rows[0] ?? null;
  });

  if (!targetConversation) {
    throw new AppError("Target conversation not found", 404, "conversation_not_found");
  }

  const sourceContent = sourceMessage.content_json && typeof sourceMessage.content_json === "object"
    ? (sourceMessage.content_json as Record<string, unknown>)
    : null;
  const outboundMedia =
    sourceContent?.outboundMedia && typeof sourceContent.outboundMedia === "object"
      ? (sourceContent.outboundMedia as Record<string, unknown>)
      : null;
  const attachment = outboundMedia
    ? {
        kind: outboundMedia.kind as "image" | "video" | "audio" | "document",
        fileName: String(outboundMedia.fileName ?? sourceMessage.content_text ?? "attachment"),
        mimeType: String(outboundMedia.mimeType ?? "application/octet-stream"),
        dataBase64: String(outboundMedia.dataBase64 ?? ""),
        fileSizeBytes: Number(outboundMedia.fileSizeBytes ?? 1)
      }
    : null;

  if (sourceMessage.message_type !== "text" && (!attachment || !attachment.dataBase64)) {
    throw new AppError("This message cannot be forwarded because its media payload is unavailable", 400, "forward_unavailable");
  }

  const forwardedMessage = await sendMessageService.send({
    organizationId,
    organizationUserId: auth.organizationUserId ?? null,
    whatsappAccountId: targetConversation.whatsapp_account_id,
    conversationId: input.targetConversationId,
    forwardedFromMessageId: sourceMessage.id,
    text: sourceMessage.message_type === "text" ? sourceMessage.content_text : undefined,
    attachment
  });

  await auditLogService.record(auth, {
    organizationId,
    action: "message.forwarded",
    entityType: "message",
    entityId: forwardedMessage.id,
    metadata: {
      source_message_id: sourceMessage.id,
      source_conversation_id: sourceMessage.conversation_id,
      target_conversation_id: input.targetConversationId,
      whatsapp_account_id: forwardedMessage.whatsapp_account_id
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: forwardedMessage });
}

export async function retryOutboundMessage(request: Request, response: Response) {
  const { messageId } = messageParamsSchema.parse(request.params);

  const bodySchema = z.object({
    organizationId: z.string().uuid().nullable().optional()
  });

  const input = bodySchema.parse(request.body ?? {});
  const organizationId = input.organizationId ?? request.auth?.organizationId ?? null;

  const result = await messageDispatchService.retryMessage({
    messageId,
    organizationId
  });

  if (!result.ok) {
    throw new AppError(result.reason ?? "Pending outbound job not found", 404, "message_retry_not_found");
  }

  return response.json({
    ok: true,
    data: result
  });
}
