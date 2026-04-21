import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { AdminService } from "../../services/adminService.js";

const adminService = new AdminService();
const auditLogService = new AuditLogService();

const createOrganizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional().nullable()
});

const createUserSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  email: z.string().email(),
  fullName: z.string().min(1).optional().nullable(),
  password: z.string().min(8),
  role: z.enum(["super_admin", "org_admin", "manager", "agent", "user"])
});

const createWhatsAppAccountSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  phoneNumber: z.string().min(6).optional().nullable()
});

const rawEventStatusSchema = z.enum(["pending", "processing", "processed", "failed", "ignored"]);

const replayRawEventsSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  whatsappAccountId: z.string().uuid().optional().nullable(),
  eventIds: z.array(z.string().uuid()).optional(),
  statuses: z.array(rawEventStatusSchema).optional(),
  limit: z.number().int().positive().max(500).optional(),
  processNow: z.boolean().optional()
});

const listWhatsAppAccountsQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const listRawEventsQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  whatsapp_account_id: z.string().uuid().optional(),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function mapWhatsAppAccount(account: {
  id: string;
  organization_id: string;
  label: string | null;
  account_phone_e164: string | null;
  account_phone_normalized: string | null;
  connection_status: string;
  last_connected_at?: string | null;
  last_disconnected_at?: string | null;
  health_score?: number | null;
}) {
  return {
    id: account.id,
    organization_id: account.organization_id,
    name: account.label,
    phone_number: account.account_phone_e164,
    phone_number_normalized: account.account_phone_normalized,
    status: account.connection_status,
    last_connected_at: account.last_connected_at ?? null,
    last_disconnected_at: account.last_disconnected_at ?? null,
    health_score: account.health_score ?? null
  };
}

export async function listOrganizations(_request: Request, response: Response) {
  const organizations = await adminService.listOrganizations();
  return response.json({ data: organizations });
}

export async function createOrganization(request: Request, response: Response) {
  const input = createOrganizationSchema.parse(request.body);
  const organization = await adminService.createOrganization(input);

  await auditLogService.record(request.auth ?? null, {
    organizationId: organization.id,
    action: "organization.created",
    entityType: "organization",
    entityId: organization.id,
    metadata: {
      name: organization.name,
      slug: organization.slug
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: organization });
}

export async function deleteOrganization(request: Request, response: Response) {
  const organizationId = z.string().uuid().parse(request.params.organizationId);
  await adminService.deleteOrganization(organizationId);

  await auditLogService.record(request.auth ?? null, {
    organizationId,
    action: "organization.deleted",
    entityType: "organization",
    entityId: organizationId,
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function listOrganizationUsers(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = typeof request.query.organization_id === "string" ? request.query.organization_id : undefined;
  const users = await adminService.listUsers(auth, organizationId);
  return response.json({ data: users });
}

export async function createOrganizationUser(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createUserSchema.parse(request.body);
  const user = await adminService.createUser(auth, {
    ...input,
    fullName: input.fullName ?? null
  });

  await auditLogService.record(auth, {
    organizationId: user.organization_id,
    action: "organization_user.created",
    entityType: "organization_user",
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({
    data: {
      id: user.id,
      organizationId: user.organization_id,
      authUserId: user.auth_user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      status: user.status
    }
  });
}

export async function deleteOrganizationUser(request: Request, response: Response) {
  const auth = requireAuth(request);
  const userId = z.string().uuid().parse(request.params.userId);
  await adminService.deleteUser(auth, userId);

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "organization_user.deleted",
    entityType: "organization_user",
    entityId: userId,
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function listWhatsAppAccounts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = listWhatsAppAccountsQuerySchema.parse(request.query);
  const accounts = await adminService.listWhatsAppAccounts(auth, organizationId);
  return response.json({ data: accounts.map(mapWhatsAppAccount) });
}

export async function createWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createWhatsAppAccountSchema.parse(request.body);
  const account = await adminService.createWhatsAppAccount(auth, {
    ...input,
    phoneNumber: input.phoneNumber ?? null
  });

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.created",
    entityType: "whatsapp_account",
    entityId: account.id,
    metadata: {
      label: account.label
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: mapWhatsAppAccount(account) });
}

export async function reconnectWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const account = await adminService.reconnectWhatsAppAccount(auth, accountId);

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.reconnected",
    entityType: "whatsapp_account",
    entityId: account.id,
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: mapWhatsAppAccount(account) });
}

export async function deleteWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  await adminService.deleteWhatsAppAccount(auth, accountId);

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "whatsapp_account.deleted",
    entityType: "whatsapp_account",
    entityId: accountId,
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function listRawEvents(request: Request, response: Response) {
  const auth = requireAuth(request);
  const {
    organization_id: organizationId,
    whatsapp_account_id: whatsappAccountId,
    status: statusQuery,
    limit: parsedLimit
  } = listRawEventsQuerySchema.parse(request.query);
  const statuses = Array.isArray(statusQuery)
    ? statusQuery
    : typeof statusQuery === "string"
      ? statusQuery.split(",").map((status) => status.trim()).filter(Boolean)
      : undefined;

  const parsedStatuses = statuses ? z.array(rawEventStatusSchema).parse(statuses) : undefined;

  const events = await adminService.listRawEvents(auth, {
    organizationId,
    whatsappAccountId,
    statuses: parsedStatuses,
    limit: parsedLimit
  });

  return response.json({ data: events });
}

export async function replayRawEvents(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = replayRawEventsSchema.parse(request.body);
  const result = await adminService.replayRawEvents(auth, {
    organizationId: input.organizationId ?? null,
    whatsappAccountId: input.whatsappAccountId ?? null,
    eventIds: input.eventIds,
    statuses: input.statuses,
    limit: input.limit,
    processNow: input.processNow ?? true
  });

  await auditLogService.record(auth, {
    organizationId: input.organizationId ?? auth.organizationId,
    action: "raw_events.replayed",
    entityType: "raw_channel_event_batch",
    entityId: input.whatsappAccountId ?? null,
    metadata: {
      event_ids: input.eventIds ?? [],
      statuses: input.statuses ?? ["failed"],
      limit: input.limit ?? null,
      process_now: input.processNow ?? true,
      replayed: result.replayed,
      processed: result.processed
    },
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: result });
}
