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

const sendSchema = z.object({
  whatsappAccountId: z.string().uuid(),
  conversationId: z.string().uuid(),
  text: z.string().min(1)
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
      external_message_id: message.external_message_id
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: message });
}
