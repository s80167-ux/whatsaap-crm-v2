import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { AdminService } from "../../services/adminService.js";

const adminService = new AdminService();
const auditLogService = new AuditLogService();

const createUserSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  email: z.string().email(),
  fullName: z.string().min(1).optional().nullable(),
  password: z.string().min(8),
  role: z.enum(["super_admin", "org_admin", "manager", "agent", "user"])
});

const updateUserSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  fullName: z.string().min(1).optional().nullable(),
  role: z.enum(["org_admin", "manager", "agent", "user"]),
  status: z.enum(["invited", "active", "disabled"])
});

const resetPasswordSchema = z.object({
  password: z.string().min(8)
});

const listUsersQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const organizationParamsSchema = z.object({
  organizationId: z.string().uuid().optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function listOrganizationUsers(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = listUsersQuerySchema.parse(request.query);
  const users = await adminService.listUsers(auth, organizationId);
  return response.json({ data: users });
}

export async function createOrganizationUser(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createUserSchema.parse(request.body);
  const { organizationId: organizationIdFromParams } = organizationParamsSchema.parse(request.params);
  const user = await adminService.createUser(auth, {
    ...input,
    organizationId: organizationIdFromParams ?? input.organizationId ?? null,
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

export async function updateOrganizationUser(request: Request, response: Response) {
  const auth = requireAuth(request);
  const userId = z.string().uuid().parse(request.params.userId);
  const input = updateUserSchema.parse(request.body);
  const user = await adminService.updateUser(auth, userId, {
    organizationId: input.organizationId ?? null,
    fullName: input.fullName ?? null,
    role: input.role,
    status: input.status
  });

  await auditLogService.record(auth, {
    organizationId: user.organization_id,
    action: "organization_user.updated",
    entityType: "organization_user",
    entityId: user.id,
    metadata: {
      role: user.role,
      status: user.status
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: user });
}

export async function resetOrganizationUserPassword(request: Request, response: Response) {
  const auth = requireAuth(request);
  const userId = z.string().uuid().parse(request.params.userId);
  const input = resetPasswordSchema.parse(request.body);
  const user = await adminService.resetUserPassword(auth, userId, input.password);

  await auditLogService.record(auth, {
    organizationId: user.organization_id,
    action: "organization_user.password_reset",
    entityType: "organization_user",
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
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
