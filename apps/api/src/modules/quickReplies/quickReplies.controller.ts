import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { QuickReplyService } from "../../services/quickReplyService.js";

const quickReplyService = new QuickReplyService();
const auditLogService = new AuditLogService();

const listQuickRepliesQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  include_inactive: z.coerce.boolean().optional()
});

const quickReplyParamsSchema = z.object({
  templateId: z.string().uuid()
});

const createQuickReplySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(2000),
  category: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional()
});

const updateQuickReplySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().min(1).max(2000).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional()
}).refine(
  (input) =>
    input.title !== undefined ||
    input.body !== undefined ||
    input.category !== undefined ||
    input.isActive !== undefined ||
    input.sortOrder !== undefined,
  { message: "At least one field must be provided" }
);

const recordQuickReplyUsageSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function listQuickReplies(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId, include_inactive: includeInactive } = listQuickRepliesQuerySchema.parse(request.query);
  const canManage = auth.role === "super_admin" || auth.permissionKeys.includes("org.manage_settings");
  const templates = await quickReplyService.list(auth, {
    organizationId,
    activeOnly: canManage ? !includeInactive : true
  });

  return response.json({ data: templates });
}

export async function createQuickReply(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createQuickReplySchema.parse(request.body);
  const template = await quickReplyService.create(auth, input);

  await auditLogService.record(auth, {
    organizationId: template.organization_id,
    action: "quick_reply.created",
    entityType: "quick_reply_template",
    entityId: template.id,
    metadata: {
      title: template.title,
      category: template.category,
      is_active: template.is_active
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: template });
}

export async function updateQuickReply(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { templateId } = quickReplyParamsSchema.parse(request.params);
  const input = updateQuickReplySchema.parse(request.body);
  const template = await quickReplyService.update(auth, {
    ...input,
    templateId
  });

  await auditLogService.record(auth, {
    organizationId: template.organization_id,
    action: "quick_reply.updated",
    entityType: "quick_reply_template",
    entityId: template.id,
    metadata: {
      title: template.title,
      category: template.category,
      is_active: template.is_active,
      requested_changes: input
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: template });
}

export async function deleteQuickReply(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { templateId } = quickReplyParamsSchema.parse(request.params);
  const { organization_id: organizationId } = listQuickRepliesQuerySchema.parse(request.query);
  await quickReplyService.delete(auth, {
    organizationId,
    templateId
  });

  await auditLogService.record(auth, {
    organizationId: organizationId ?? auth.organizationId,
    action: "quick_reply.deleted",
    entityType: "quick_reply_template",
    entityId: templateId,
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function recordQuickReplyUsage(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { templateId } = quickReplyParamsSchema.parse(request.params);
  const input = recordQuickReplyUsageSchema.parse(request.body);
  const template = await quickReplyService.recordUsage(auth, {
    organizationId: input.organizationId ?? null,
    templateId
  });

  await auditLogService.record(auth, {
    organizationId: template.organization_id,
    action: "quick_reply.used",
    entityType: "quick_reply_template",
    entityId: template.id,
    metadata: {
      title: template.title,
      category: template.category,
      conversation_id: input.conversationId ?? null,
      usage_count: template.usage_count
    },
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: template });
}
