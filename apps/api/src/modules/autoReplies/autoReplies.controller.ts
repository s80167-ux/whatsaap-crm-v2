import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { AutoReplyService } from "../../services/autoReplyService.js";

const autoReplyService = new AutoReplyService();
const auditLogService = new AuditLogService();

const querySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const updateSettingsSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  isEnabled: z.boolean(),
  quickReplyTemplateId: z.string().uuid().optional().nullable(),
  timezone: z.string().trim().min(1).max(80).default("Asia/Kuala_Lumpur"),
  businessHoursEnabled: z.boolean(),
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  businessDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  outsideHoursEnabled: z.boolean(),
  noReplyEnabled: z.boolean(),
  noReplyDelayMinutes: z.number().int().min(1).max(1440),
  firstMessageEnabled: z.boolean(),
  cooldownMinutes: z.number().int().min(0).max(10080)
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getAutoReplySettings(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = querySchema.parse(request.query);
  const settings = await autoReplyService.getSettings(auth, { organizationId });
  return response.json({ data: settings });
}

export async function updateAutoReplySettings(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = updateSettingsSchema.parse(request.body);
  const settings = await autoReplyService.updateSettings(auth, input);

  await auditLogService.record(auth, {
    organizationId: settings.organization_id,
    action: "auto_reply.settings_updated",
    entityType: "auto_reply_settings",
    entityId: settings.organization_id,
    metadata: {
      is_enabled: settings.is_enabled,
      quick_reply_template_id: settings.quick_reply_template_id,
      outside_hours_enabled: settings.outside_hours_enabled,
      no_reply_enabled: settings.no_reply_enabled,
      first_message_enabled: settings.first_message_enabled
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: settings });
}
