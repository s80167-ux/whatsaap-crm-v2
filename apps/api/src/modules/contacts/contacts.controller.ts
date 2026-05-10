import type { Request, Response } from "express";
import { z } from "zod";
import { withTransaction } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";
import { ContactAssignmentService } from "../../services/contactAssignmentService.js";
import { ContactCommandService } from "../../services/contactCommandService.js";
import { ContactRepairProposalService } from "../../services/contactRepairProposalService.js";
import { ConversationService } from "../../services/conversationService.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { QueryService, type ActivityRangeFilter } from "../../services/queryService.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";

const queryService = new QueryService();
const contactAssignmentService = new ContactAssignmentService();
const contactCommandService = new ContactCommandService();
const conversationService = new ConversationService();
const auditLogService = new AuditLogService();

const contactParamsSchema = z.object({
  contactId: z.string().uuid()
});

const assignContactBodySchema = z.object({
  organizationUserId: z.string().uuid()
});

const startConversationBodySchema = z.object({
  whatsappAccountId: z.string().uuid()
});

const createContactBodySchema = z.object({
  displayName: z.string().min(1).optional().nullable(),
  phoneNumber: z.string().min(6).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable(),
  companyName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable()
});

const updateContactBodySchema = z.object({
  displayName: z.string().min(1).optional().nullable(),
  phoneNumber: z.string().min(6).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable(),
  companyName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable()
}).refine(
  (input) =>
    input.displayName !== undefined ||
    input.phoneNumber !== undefined ||
    input.email !== undefined ||
    input.companyName !== undefined ||
    input.notes !== undefined ||
    input.ownerUserId !== undefined,
  { message: "At least one field must be provided" }
);

const mergeContactsBodySchema = z.object({
  sourceContactId: z.string().uuid(),
  targetContactId: z.string().uuid(),
  note: z.string().trim().max(500).optional().nullable()
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

export async function getContacts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const activityRange = resolveActivityRange(request);
  const contacts = await queryService.listContacts(auth, organizationId, activityRange);
  return response.json({ data: contacts });
}

export async function getContact(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = resolveReadOrganizationId(request);
  const { contactId } = contactParamsSchema.parse(request.params);
  const contact = await queryService.getContact(auth, organizationId, contactId);

  if (!contact) {
    throw new AppError("Contact not found", 404, "contact_not_found");
  }

  return response.json({ data: contact });
}

export async function createContact(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const input = createContactBodySchema.parse(request.body);

  const contact = await withTransaction((client) =>
    contactCommandService.create(client, {
      organizationId: auth.organizationId!,
      displayName: input.displayName ?? null,
      phoneNumber: input.phoneNumber ?? null,
      email: input.email ?? null,
      companyName: input.companyName ?? null,
      notes: input.notes ?? null,
      ownerUserId: input.ownerUserId ?? null
    })
  );

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "contact.created",
    entityType: "contact",
    entityId: contact.id,
    metadata: {
      display_name: contact.display_name,
      primary_phone_e164: contact.primary_phone_e164,
      email: contact.email ?? null,
      company_name: contact.company_name ?? null,
      notes: contact.notes ?? null,
      owner_user_id: contact.owner_user_id ?? null
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: contact });
}

export async function updateContact(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = auth.organizationId ?? organization_id ?? "";

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { contactId } = contactParamsSchema.parse(request.params);
  const input = updateContactBodySchema.parse(request.body);

  const contact = await withTransaction((client) =>
    contactCommandService.update(client, {
      organizationId,
      contactId,
      displayName: input.displayName,
      phoneNumber: input.phoneNumber,
      email: input.email,
      companyName: input.companyName,
      notes: input.notes,
      ownerUserId: input.ownerUserId
    })
  );

  await auditLogService.record(auth, {
    organizationId,
    action: "contact.updated",
    entityType: "contact",
    entityId: contact.id,
    metadata: {
      display_name: contact.display_name,
      primary_phone_e164: contact.primary_phone_e164,
      email: contact.email ?? null,
      company_name: contact.company_name ?? null,
      notes: contact.notes ?? null,
      owner_user_id: contact.owner_user_id ?? null
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: contact });
}

export async function assignContact(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { contactId } = contactParamsSchema.parse(request.params);
  const { organizationUserId } = assignContactBodySchema.parse(request.body);

  const contact = await withTransaction((client) =>
    contactAssignmentService.assign(client, {
      organizationId: auth.organizationId!,
      contactId,
      organizationUserId
    })
  );

  return response.status(201).json({ data: contact });
}

export async function mergeContacts(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const input = mergeContactsBodySchema.parse(request.body);

  const result = await ContactRepairProposalService.mergeContactsManually({
    sourceContactId: input.sourceContactId,
    targetContactId: input.targetContactId,
    note: input.note ?? null,
    user: auth
  });

  return response.json({ data: result });
}

export async function startContactConversation(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { contactId } = contactParamsSchema.parse(request.params);
  const { whatsappAccountId } = startConversationBodySchema.parse(request.body);
  const contact = await queryService.getContact(auth, auth.organizationId, contactId);

  if (!contact) {
    throw new AppError("Contact not found", 404, "contact_not_found");
  }

  const hasSelectedSource = contact.whatsapp_sources?.some((source) => source.id === whatsappAccountId);

  if (!hasSelectedSource) {
    throw new AppError("Contact has no WhatsApp source for the selected account", 400, "contact_whatsapp_source_missing");
  }

  const conversation = await withTransaction((client) =>
    conversationService.findOrCreateConversation(client, {
      organizationId: auth.organizationId!,
      whatsappAccountId,
      contactId
    })
  );

  return response.status(201).json({ data: conversation });
}
