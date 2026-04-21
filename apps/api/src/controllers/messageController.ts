import type { Request, Response } from "express";
import { z } from "zod";
import { getRequestAuditContext } from "../lib/requestAudit.js";
import { AuditLogService } from "../services/auditLogService.js";
import { QueryService } from "../services/queryService.js";
import { SendMessageService } from "../services/sendMessageService.js";

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

export async function getMessages(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = req.auth?.organizationId ?? String(req.query.organization_id || "");
  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const { conversation_id } = z
    .object({
      conversation_id: z.string().uuid()
    })
    .parse(req.params);

  const messages = await queryService.listMessages(req.auth, organizationId, conversation_id);
  return res.json({ data: messages });
}

export async function sendWhatsAppMessage(req: Request, res: Response) {
  const input = sendSchema.parse(req.body);

  if (!req.auth?.organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const message = await sendMessageService.send({
    ...input,
    organizationId: req.auth.organizationId
  });

  await auditLogService.record(req.auth, {
    organizationId: req.auth.organizationId,
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
    request: getRequestAuditContext(req)
  });

  return res.status(201).json({ data: message });
}
