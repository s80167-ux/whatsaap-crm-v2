import type { Request, Response } from "express";
import { z } from "zod";
import { PlatformService } from "../../services/platformService.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AppError } from "../../lib/errors.js";

const platformService = new PlatformService();
const auditLogService = new AuditLogService();
const platformAuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional()
});
const platformOutboxQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});
const retryOutboundDispatchSchema = z.object({
  outboxIds: z.array(z.string().uuid()).optional(),
  limit: z.number().int().positive().max(100).optional(),
  processNow: z.boolean().optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getPlatformOrganizations(_request: Request, response: Response) {
  const organizations = await platformService.listOrganizations();
  return response.json({ data: organizations });
}

export async function getPlatformUsage(_request: Request, response: Response) {
  const usage = await platformService.getUsageSummary();
  return response.json({ data: usage });
}

export async function getPlatformHealth(_request: Request, response: Response) {
  const health = await platformService.getHealthSummary();
  return response.json({ data: health });
}

export async function getPlatformAuditLogs(request: Request, response: Response) {
  const { limit = 100 } = platformAuditLogQuerySchema.parse(request.query);
  const logs = await platformService.getAuditSummary(limit);
  return response.json({ data: logs });
}

export async function getPlatformOutboundDispatch(request: Request, response: Response) {
  const { limit = 25 } = platformOutboxQuerySchema.parse(request.query);
  const summary = await platformService.getOutboundDispatchSummary(limit);
  return response.json({ data: summary });
}

export async function retryPlatformOutboundDispatch(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = retryOutboundDispatchSchema.parse(request.body);
  const result = await platformService.retryOutboundDispatch({
    outboxIds: input.outboxIds,
    limit: input.limit,
    processNow: input.processNow ?? true
  });

  await auditLogService.record(auth, {
    organizationId: null,
    action: "outbound_dispatch.retried",
    entityType: "message_dispatch_outbox_batch",
    entityId: null,
    metadata: {
      outbox_ids: result.outboxIds,
      retried: result.retried,
      processed: result.processed,
      limit: input.limit ?? null,
      process_now: input.processNow ?? true
    },
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: result });
}
