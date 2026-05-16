import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { AdminService } from "../../services/adminService.js";
import { callDeepSeekMessageAssist } from "../../services/aiMessageAssistService.js";

const adminService = new AdminService();

const messageAssistSchema = z.object({
  source: z.enum(["campaign", "template"]),
  action: z.enum(["generate", "improve", "shorten", "friendly", "professional", "check"]),
  message: z.string().trim().min(1, "Message is required").max(3000, "Message must be 3000 characters or fewer"),
  organizationId: z.string().uuid().optional().nullable(),
  language: z.enum(["ms-MY", "en-MY"]).optional(),
  tone: z.string().trim().max(80).optional(),
  variables: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  campaignObjective: z.string().trim().max(500).optional(),
  templatePurpose: z.string().trim().max(500).optional(),
  audienceContext: z.record(z.unknown()).optional()
});

export async function assistMessage(request: Request, response: Response) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  const input = messageAssistSchema.parse(request.body);

  if (input.action === "generate" && input.source !== "template") {
    throw new AppError("Generate Draft is only available for message templates", 400, "generate_template_only");
  }

  const organizationId = request.auth.role === "super_admin" ? input.organizationId ?? null : request.auth.organizationId;

  if (!organizationId) {
    throw new AppError("Organization is required for AI Message Assist", 400, "organization_required");
  }

  const moduleStatus = await adminService.getAiMessageAssistModuleStatus(request.auth, organizationId);

  if (!moduleStatus.isEnabled) {
    throw new AppError("AI Message Assist is not enabled for this organization", 403, "ai_message_assist_disabled");
  }

  await adminService.assertAiUsageAllowed(request.auth, organizationId);

  const result = await callDeepSeekMessageAssist(input);
  await adminService.recordAiUsage(request.auth, organizationId, {
    source: input.source,
    action: input.action,
    provider: result.provider,
    model: result.usage.model,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    creditUnits: result.usage.creditUnits
  });

  return response.json(result);
}
