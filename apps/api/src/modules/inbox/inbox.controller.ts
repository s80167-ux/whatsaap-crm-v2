import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { QueryService, type ActivityRangeFilter } from "../../services/queryService.js";

const queryService = new QueryService();

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const historyRangeQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(365).optional(),
    months: z.coerce.number().int().positive().max(24).optional()
  })
  .refine((input) => !(input.days && input.months), {
    message: "Choose either days or months, not both"
  });

function resolveReadOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = request.auth?.organizationId ?? organization_id ?? "";

  if (!organizationId && request.auth?.role === "super_admin") {
    return null;
  }

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

function resolveActivityRange(request: Request): ActivityRangeFilter | undefined {
  const { days, months } = historyRangeQuerySchema.parse(request.query);

  if (!days && !months) {
    return undefined;
  }

  const now = new Date();
  const since = new Date(now);

  if (days) {
    since.setUTCDate(since.getUTCDate() - days);
  } else if (months) {
    since.setUTCMonth(since.getUTCMonth() - months);
  }

  return {
    since: since.toISOString()
  };
}

export async function getInboxThreads(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const activityRange = resolveActivityRange(request);
  const conversations = await queryService.listConversations(auth, organizationId, activityRange);
  return response.json({ data: conversations });
}

export async function getInboxThreadMessages(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const { conversationId } = conversationParamsSchema.parse(request.params);
  const activityRange = resolveActivityRange(request);
  const messages = await queryService.listMessages(auth, organizationId, conversationId, activityRange);
  return response.json({ data: messages });
}
