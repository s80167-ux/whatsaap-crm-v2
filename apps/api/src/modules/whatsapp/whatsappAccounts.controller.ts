import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { AdminService } from "../../services/adminService.js";

const adminService = new AdminService();
const auditLogService = new AuditLogService();

const createWhatsAppAccountSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  phoneNumber: z.string().min(6).optional().nullable()
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
