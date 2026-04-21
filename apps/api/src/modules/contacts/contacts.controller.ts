import type { Request, Response } from "express";
import { z } from "zod";
import { withTransaction } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";
import { ContactAssignmentService } from "../../services/contactAssignmentService.js";
import { ContactCommandService } from "../../services/contactCommandService.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { QueryService } from "../../services/queryService.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";

const queryService = new QueryService();
const contactAssignmentService = new ContactAssignmentService();
const contactCommandService = new ContactCommandService();
const auditLogService = new AuditLogService();

const contactParamsSchema = z.object({
  contactId: z.string().uuid()
});

const assignContactBodySchema = z.object({
  organizationUserId: z.string().uuid()
});

const createContactBodySchema = z.object({
  displayName: z.string().min(1).optional().nullable(),
  phoneNumber: z.string().min(6).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable()
});

const updateContactBodySchema = z.object({
  displayName: z.string().min(1).optional().nullable(),
  phoneNumber: z.string().min(6).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable()
}).refine(
  (input) => input.displayName !== undefined || input.phoneNumber !== undefined || input.ownerUserId !== undefined,
  { message: "At least one field must be provided" }
);

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

function requireOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = request.auth?.organizationId ?? organization_id ?? "";

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

export async function getContacts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const contacts = await queryService.listContacts(auth, organizationId);
  return response.json({ data: contacts });
}

export async function getContact(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
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
      owner_user_id: contact.owner_user_id ?? null
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: contact });
}

export async function updateContact(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { contactId } = contactParamsSchema.parse(request.params);
  const input = updateContactBodySchema.parse(request.body);

  const contact = await withTransaction((client) =>
    contactCommandService.update(client, {
      organizationId: auth.organizationId!,
      contactId,
      displayName: input.displayName,
      phoneNumber: input.phoneNumber,
      ownerUserId: input.ownerUserId
    })
  );

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "contact.updated",
    entityType: "contact",
    entityId: contact.id,
    metadata: {
      display_name: contact.display_name,
      primary_phone_e164: contact.primary_phone_e164,
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
