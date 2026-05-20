import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { ContactReliabilityService } from "../../services/contactReliabilityService.js";

const service = new ContactReliabilityService();

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const listQuerySchema = organizationQuerySchema.extend({
  level: z.enum(["verified", "strong", "partial", "weak", "broken"]).optional(),
  flag: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const summaryQuerySchema = organizationQuerySchema.extend({
  days: z.coerce.number().int().positive().max(365).optional()
});

const contactParamsSchema = z.object({
  contactId: z.string().uuid()
});

const mergePreviewParamsSchema = z.object({
  groupKey: z.string().min(1)
});

const mergeHistoryParamsSchema = z.object({
  mergeHistoryId: z.string().uuid()
});

const applySuggestionSchema = z.object({
  action: z.enum(["update_name", "update_phone", "ignore_flag"]),
  displayName: z.string().trim().max(160).optional().nullable(),
  phoneNumber: z.string().trim().max(40).optional().nullable(),
  flag: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable()
});

const mergeBodySchema = z.object({
  sourceContactId: z.string().uuid(),
  targetContactId: z.string().uuid(),
  note: z.string().trim().max(500).optional().nullable(),
  confirmedPreviewToken: z.string().optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable()
});

const recalculateBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }
  return request.auth;
}

function organizationFrom(request: Request, body?: { organizationId?: string | null; organization_id?: string | null }) {
  const query = organizationQuerySchema.safeParse(request.query);
  return body?.organizationId ?? body?.organization_id ?? (query.success ? query.data.organization_id : undefined) ?? null;
}

export async function getReliabilitySummary(request: Request, response: Response) {
  const auth = requireAuth(request);
  const query = summaryQuerySchema.parse(request.query);
  const data = await service.getSummary(auth, { organizationId: query.organization_id, days: query.days });
  return response.json({ data });
}

export async function listRiskyContacts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const query = listQuerySchema.parse(request.query);
  const data = await service.listRiskyContacts(auth, {
    organizationId: query.organization_id,
    level: query.level ?? null,
    flag: query.flag ?? null,
    search: query.search ?? null,
    limit: query.limit,
    offset: query.offset
  });
  return response.json({ data });
}

export async function listUnknownContacts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const query = listQuerySchema.parse(request.query);
  const data = await service.listUnknownContacts(auth, {
    organizationId: query.organization_id,
    limit: query.limit,
    offset: query.offset
  });
  return response.json({ data });
}

export async function listDuplicateGroups(request: Request, response: Response) {
  const auth = requireAuth(request);
  const query = listQuerySchema.parse(request.query);
  const data = await service.listDuplicateGroups(auth, { organizationId: query.organization_id, limit: query.limit });
  return response.json({ data });
}

export async function getContactTimeline(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = contactParamsSchema.parse(request.params);
  const data = await service.getTimeline(auth, {
    organizationId: organizationFrom(request),
    contactId: params.contactId
  });
  return response.json({ data });
}

export async function applyContactSuggestion(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = contactParamsSchema.parse(request.params);
  const input = applySuggestionSchema.parse(request.body);
  const data = await service.applySuggestion(auth, {
    organizationId: organizationFrom(request, input),
    contactId: params.contactId,
    action: input.action,
    displayName: input.displayName ?? null,
    phoneNumber: input.phoneNumber ?? null,
    flag: input.flag ?? null,
    note: input.note ?? null
  });
  return response.json({ data });
}

export async function getDuplicateMergePreview(request: Request, response: Response) {
  const auth = requireAuth(request);
  mergePreviewParamsSchema.parse(request.params);
  const input = mergeBodySchema.pick({ sourceContactId: true, targetContactId: true, organizationId: true, organization_id: true }).parse(request.body);
  const data = await service.getMergePreview(auth, {
    organizationId: organizationFrom(request, input),
    sourceContactId: input.sourceContactId,
    targetContactId: input.targetContactId
  });
  return response.json({ data });
}

export async function mergeDuplicateContacts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = mergeBodySchema.parse(request.body);
  const data = await service.mergeDuplicates(auth, {
    organizationId: organizationFrom(request, input),
    sourceContactId: input.sourceContactId,
    targetContactId: input.targetContactId,
    note: input.note ?? null
  });
  return response.json({ data });
}

export async function revertMerge(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = mergeHistoryParamsSchema.parse(request.params);
  const input = recalculateBodySchema.parse(request.body ?? {});
  const data = await service.revertMerge(auth, {
    organizationId: organizationFrom(request, input),
    mergeHistoryId: params.mergeHistoryId
  });
  return response.json({ data });
}

export async function recalculateReliability(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = recalculateBodySchema.parse(request.body ?? {});
  const data = await service.recalculate(auth, { organizationId: organizationFrom(request, input) });
  return response.json({ data });
}
