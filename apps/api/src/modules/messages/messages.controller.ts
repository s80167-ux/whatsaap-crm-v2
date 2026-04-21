import type { Request, Response } from "express";
import { z } from "zod";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AppError } from "../../lib/errors.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { QueryService } from "../../services/queryService.js";
import { SendMessageService } from "../../services/sendMessageService.js";

const queryService = new QueryService();
const sendMessageService = new SendMessageService();
const auditLogService = new AuditLogService();

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
  text: z.string().trim().max(4000).optional(),
  attachment: attachmentSchema.optional().nullable()
}).refine((input) => Boolean(input.text?.trim()) || Boolean(input.attachment), {
  message: "Message text or one attachment is required",
  path: ["text"]
});

const conversationParamsSchema = z.object({
  conversation_id: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

function requireOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = request.auth?.organizationId ?? organization_id ?? "";

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

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const message = await sendMessageService.send({
    ...input,
    organizationId: auth.organizationId
  });

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "message.sent",
    entityType: "message",
    entityId: message.id,
    metadata: {
      conversation_id: input.conversationId,
      whatsapp_account_id: input.whatsappAccountId,
      external_message_id: message.external_message_id,
      message_type: input.attachment?.kind ?? "text",
      attachment_file_name: input.attachment?.fileName ?? null
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: message });
}
