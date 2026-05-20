import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { OpsCenterService } from "../../services/opsCenterService.js";

const opsCenterService = new OpsCenterService();
const auditLogService = new AuditLogService();

const rawEventStatusSchema = z.enum(["pending", "processing", "failed", "ignored", "processed"]);
const outboxStatusSchema = z.enum(["pending", "processing", "failed", "dispatched"]);

const limitedQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50)
});

const rawEventsQuerySchema = limitedQuerySchema.extend({
  status: rawEventStatusSchema.optional()
});

const outboxQuerySchema = limitedQuerySchema.extend({
  status: outboxStatusSchema.optional()
});

const campaignDispatchQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  status: z.string().min(1).optional(),
  campaignId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50)
});

const replayRawEventsSchema = z.object({
  organizationId: z.string().uuid(),
  statuses: z.array(rawEventStatusSchema).min(1).optional().default(["failed"]),
  limit: z.coerce.number().int().positive().max(500).default(100)
});

const projectionRebuildSchema = z.object({
  organizationId: z.string().uuid(),
  scope: z.enum(["organization", "conversation", "contact"]),
  conversationId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getOpsCenterSummary(_request: Request, response: Response) {
  const summary = await opsCenterService.getSummary();
  return response.json({ data: summary });
}

export async function getOpsCenterConnectors(_request: Request, response: Response) {
  const connectors = await opsCenterService.listConnectors();
  return response.json({ data: connectors });
}

export async function getOpsCenterRawEvents(request: Request, response: Response) {
  const input = rawEventsQuerySchema.parse(request.query);
  const events = await opsCenterService.listRawEvents(input);
  return response.json({ data: events });
}

export async function retryOpsCenterRawEvent(request: Request, response: Response) {
  const auth = requireAuth(request);
  const eventId = z.string().uuid().parse(request.params.eventId);
  const event = await opsCenterService.retryRawEvent(eventId);

  await auditLogService.record(auth, {
    organizationId: event.organization_id,
    action: "ops_center.raw_event_retry",
    entityType: "raw_channel_events",
    entityId: event.id,
    metadata: { status: event.processing_status, retry_count: event.retry_count },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: event });
}

export async function replayOpsCenterRawEvents(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = replayRawEventsSchema.parse(request.body);
  const count = await opsCenterService.replayRawEvents(input);

  await auditLogService.record(auth, {
    organizationId: input.organizationId,
    action: "ops_center.raw_events_replay",
    entityType: "raw_channel_events",
    entityId: null,
    metadata: { statuses: input.statuses, limit: input.limit, updated: count },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: { updated: count } });
}

export async function getOpsCenterOutbox(request: Request, response: Response) {
  const input = outboxQuerySchema.parse(request.query);
  const jobs = await opsCenterService.listOutbox(input);
  return response.json({ data: jobs });
}

export async function retryOpsCenterOutboxJob(request: Request, response: Response) {
  const auth = requireAuth(request);
  const jobId = z.string().uuid().parse(request.params.jobId);
  const job = await opsCenterService.retryOutboxJob(jobId);

  await auditLogService.record(auth, {
    organizationId: job.organization_id,
    action: "ops_center.outbox_retry",
    entityType: "message_dispatch_outbox",
    entityId: job.id,
    metadata: { status: job.processing_status, attempt_count: job.attempt_count },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: job });
}

export async function getOpsCenterCampaignDispatch(request: Request, response: Response) {
  const input = campaignDispatchQuerySchema.parse(request.query);
  const campaigns = await opsCenterService.listCampaignDispatch(input);
  return response.json({ data: campaigns });
}

export async function rebuildOpsCenterProjections(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = projectionRebuildSchema.parse(request.body);
  const result = await opsCenterService.rebuildProjections(input);

  await auditLogService.record(auth, {
    organizationId: input.organizationId,
    action: "ops_center.projections_rebuild",
    entityType: "projection_rebuild",
    entityId: input.conversationId ?? input.contactId ?? input.organizationId,
    metadata: { ...input, result },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: result });
}

export async function getOpsCenterOrganizations(_request: Request, response: Response) {
  const organizations = await opsCenterService.listOrganizations();
  return response.json({ data: organizations });
}
