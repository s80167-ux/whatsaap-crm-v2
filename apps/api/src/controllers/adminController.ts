import type { Request, Response } from "express";
import { z } from "zod";
import { getRequestAuditContext } from "../lib/requestAudit.js";
import { AdminService } from "../services/adminService.js";
import { AuditLogService } from "../services/auditLogService.js";

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

export async function listOrganizations(_req: Request, res: Response) {
  const organizations = await adminService.listOrganizations();
  return res.json({ data: organizations });
}

export async function createOrganization(req: Request, res: Response) {
  const input = createOrganizationSchema.parse(req.body);
  const organization = await adminService.createOrganization(input);
  await auditLogService.record(req.auth ?? null, {
    organizationId: organization.id,
    action: "organization.created",
    entityType: "organization",
    entityId: organization.id,
    metadata: {
      name: organization.name,
      slug: organization.slug
    },
    request: getRequestAuditContext(req)
  });
  return res.status(201).json({ data: organization });
}

export async function deleteOrganization(req: Request, res: Response) {
  const organizationId = z.string().uuid().parse(req.params.organizationId);
  await adminService.deleteOrganization(organizationId);
  await auditLogService.record(req.auth ?? null, {
    organizationId,
    action: "organization.deleted",
    entityType: "organization",
    entityId: organizationId,
    request: getRequestAuditContext(req)
  });
  return res.json({ ok: true });
}

export async function listOrganizationUsers(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = typeof req.query.organization_id === "string" ? req.query.organization_id : undefined;
  const users = await adminService.listUsers(req.auth, organizationId);
  return res.json({ data: users });
}

export async function createOrganizationUser(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const input = createUserSchema.parse(req.body);
  const user = await adminService.createUser(req.auth, {
    ...input,
    fullName: input.fullName ?? null
  });
  await auditLogService.record(req.auth, {
    organizationId: user.organization_id,
    action: "organization_user.created",
    entityType: "organization_user",
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role
    },
    request: getRequestAuditContext(req)
  });
  return res.status(201).json({
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

export async function deleteOrganizationUser(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const userId = z.string().uuid().parse(req.params.userId);
  await adminService.deleteUser(req.auth, userId);
  await auditLogService.record(req.auth, {
    organizationId: req.auth.organizationId,
    action: "organization_user.deleted",
    entityType: "organization_user",
    entityId: userId,
    request: getRequestAuditContext(req)
  });
  return res.json({ ok: true });
}

export async function listWhatsAppAccounts(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = typeof req.query.organization_id === "string" ? req.query.organization_id : undefined;
  const accounts = await adminService.listWhatsAppAccounts(req.auth, organizationId);
  return res.json({ data: accounts.map(mapWhatsAppAccount) });
}

export async function listRawEvents(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = typeof req.query.organization_id === "string" ? req.query.organization_id : undefined;
  const whatsappAccountId = typeof req.query.whatsapp_account_id === "string" ? req.query.whatsapp_account_id : undefined;
  const statusQuery = req.query.status;
  const statuses = Array.isArray(statusQuery)
    ? statusQuery
    : typeof statusQuery === "string"
      ? statusQuery.split(",").map((status) => status.trim()).filter(Boolean)
      : undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  const parsedStatuses = statuses ? z.array(rawEventStatusSchema).parse(statuses) : undefined;
  const parsedLimit = limit ? z.number().int().positive().max(500).parse(limit) : undefined;

  const events = await adminService.listRawEvents(req.auth, {
    organizationId,
    whatsappAccountId,
    statuses: parsedStatuses,
    limit: parsedLimit
  });

  return res.json({ data: events });
}

export async function createWhatsAppAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const input = createWhatsAppAccountSchema.parse(req.body);
  const account = await adminService.createWhatsAppAccount(req.auth, {
    ...input,
    phoneNumber: input.phoneNumber ?? null
  });
  await auditLogService.record(req.auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.created",
    entityType: "whatsapp_account",
    entityId: account.id,
    metadata: {
      label: account.label
    },
    request: getRequestAuditContext(req)
  });
  return res.status(201).json({ data: mapWhatsAppAccount(account) });
}

export async function reconnectWhatsAppAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const accountId = z.string().uuid().parse(req.params.accountId);
  const account = await adminService.reconnectWhatsAppAccount(req.auth, accountId);
  await auditLogService.record(req.auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.reconnected",
    entityType: "whatsapp_account",
    entityId: account.id,
    request: getRequestAuditContext(req)
  });
  return res.status(202).json({ data: mapWhatsAppAccount(account) });
}

export async function replayRawEvents(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const input = replayRawEventsSchema.parse(req.body);
  const result = await adminService.replayRawEvents(req.auth, {
    organizationId: input.organizationId ?? null,
    whatsappAccountId: input.whatsappAccountId ?? null,
    eventIds: input.eventIds,
    statuses: input.statuses,
    limit: input.limit,
    processNow: input.processNow ?? true
  });
  await auditLogService.record(req.auth, {
    organizationId: input.organizationId ?? req.auth.organizationId,
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
    request: getRequestAuditContext(req)
  });

  return res.status(202).json({ data: result });
}

export async function backfillWhatsAppAccount(req: Request, res: Response)
export async function deleteWhatsAppAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const accountId = z.string().uuid().parse(req.params.accountId);
  await adminService.deleteWhatsAppAccount(req.auth, accountId);
  await auditLogService.record(req.auth, {
    organizationId: req.auth.organizationId,
    action: "whatsapp_account.deleted",
    entityType: "whatsapp_account",
    entityId: accountId,
    request: getRequestAuditContext(req)
  });
  return res.json({ ok: true });
}
