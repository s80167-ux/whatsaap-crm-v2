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

const inboxChannelQuerySchema = z.object({
  channel: z.enum(["all", "whatsapp", "social", "facebook", "instagram"]).optional()
});

const messagePaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).optional(),
    before_sent_at: z.string().datetime({ offset: true }).optional(),
    before_id: z.string().uuid().optional()
  })
  .refine((input) => Boolean(input.before_sent_at) === Boolean(input.before_id), {
    message: "before_sent_at and before_id must be provided together"
  });

function resolveReadOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId =
    request.auth?.role === "super_admin"
      ? organization_id ?? request.auth.organizationId ?? ""
      : request.auth?.organizationId ?? organization_id ?? "";

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
  const { channel } = inboxChannelQuerySchema.parse(request.query);
  const conversations = await queryService.listConversations(auth, organizationId, {
    activityRange,
    channel: channel ?? "all"
  });
  return response.json({ data: conversations });
}

export async function getInboxThreadMessages(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const { conversationId } = conversationParamsSchema.parse(request.params);
  const activityRange = resolveActivityRange(request);
  const { limit, before_sent_at, before_id } = messagePaginationQuerySchema.parse(request.query);

  if (limit) {
    const page = await queryService.listMessagesPage(auth, organizationId, conversationId, {
      activityRange,
      limit,
      before:
        before_sent_at && before_id
          ? {
              sentAt: before_sent_at,
              id: before_id
            }
          : null
    });

    return response.json({
      data: page.messages,
      pagination: page.pagination
    });
  }

  const messages = await queryService.listMessages(auth, organizationId, conversationId, activityRange);
  return response.json({ data: messages });
}
