import type { Request, Response } from "express";
import { z } from "zod";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AppError } from "../../lib/errors.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { LeadService } from "../../services/leadService.js";

const leadService = new LeadService();
const auditLogService = new AuditLogService();

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const leadParamsSchema = z.object({
  leadId: z.string().uuid()
});

const createLeadSchema = z.object({
  contactId: z.string().uuid(),
  source: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["new_lead", "contacted", "interested", "processing", "closed_won", "closed_lost"]).default("new_lead"),
  temperature: z.enum(["cold", "warm", "hot"]).optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable()
});

const leadHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

const convertLeadSchema = z.object({
  status: z.enum(["open", "closed_won", "closed_lost"]).default("open"),
  totalAmount: z.coerce.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).optional().nullable()
});

const updateLeadSchema = z.object({
  source: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["new_lead", "contacted", "interested", "processing", "closed_won", "closed_lost"]).optional(),
  temperature: z.enum(["cold", "warm", "hot"]).optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable()
}).refine(
  (input) =>
    input.source !== undefined ||
    input.status !== undefined ||
    input.temperature !== undefined ||
    input.assignedUserId !== undefined,
  { message: "At least one field must be provided" }
);

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

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

function requireOrganizationId(request: Request) {
  const organizationId = resolveReadOrganizationId(request);

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return organizationId;
}

export async function getLeads(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const leads = await leadService.list(auth, organizationId);
  return response.json({ data: leads });
}

export async function getLeadDetail(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const { leadId } = leadParamsSchema.parse(request.params);
  const lead = await leadService.getDetail(auth, organizationId, leadId);
  return response.json({ data: lead });
}

export async function getLeadHistory(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const { leadId } = leadParamsSchema.parse(request.params);
  const { limit = 50 } = leadHistoryQuerySchema.parse(request.query);
  const history = await leadService.getHistory(auth, organizationId, leadId, limit);
  return response.json({ data: history });
}

export async function createLead(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const input = createLeadSchema.parse(request.body);
  const lead = await leadService.createInNewTransaction({
    authUser: auth,
    organizationId: auth.organizationId,
    contactId: input.contactId,
    source: input.source ?? null,
    status: input.status,
    temperature: input.temperature ?? null,
    assignedUserId: input.assignedUserId ?? null
  });

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      contact_id: lead.contact_id,
      status: lead.status,
      temperature: lead.temperature
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: lead });
}

export async function convertLeadToOrder(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { leadId } = leadParamsSchema.parse(request.params);
  const input = convertLeadSchema.parse(request.body);

  const result = await leadService.convertToOrderInNewTransaction({
    authUser: auth,
    organizationId: auth.organizationId,
    leadId,
    status: input.status,
    totalAmount: input.totalAmount,
    currency: input.currency ?? "MYR"
  });

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "lead.converted_to_order",
    entityType: "lead",
    entityId: result.lead.id,
    metadata: {
      sales_order_id: result.order.id,
      sales_order_status: result.order.status,
      total_amount: result.order.total_amount,
      currency: result.order.currency
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: result });
}

export async function updateLead(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { leadId } = leadParamsSchema.parse(request.params);
  const input = updateLeadSchema.parse(request.body);
  const result = await leadService.updateInNewTransaction({
    authUser: auth,
    organizationId: auth.organizationId,
    leadId,
    source: input.source,
    status: input.status,
    temperature: input.temperature,
    assignedUserId: input.assignedUserId
  });

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "lead.updated",
    entityType: "lead",
    entityId: result.lead.id,
    metadata: {
      previous_source: result.previousLead.source,
      source: result.lead.source,
      previous_status: result.previousLead.status,
      status: result.lead.status,
      previous_temperature: result.previousLead.temperature,
      temperature: result.lead.temperature,
      previous_assigned_user_id: result.previousLead.assigned_user_id,
      assigned_user_id: result.lead.assigned_user_id
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: result.lead });
}
