import type { Request, Response } from "express";
import { z } from "zod";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { AdminService } from "../../services/adminService.js";

const adminService = new AdminService();
const auditLogService = new AuditLogService();

const createOrganizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional().nullable()
});

const updateOrganizationSchema = createOrganizationSchema.extend({
  status: z.enum(["active", "trial", "suspended", "closed"]).optional()
});

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

export async function updateOrganization(request: Request, response: Response) {
  const organizationId = z.string().uuid().parse(request.params.organizationId);
  const input = updateOrganizationSchema.parse(request.body);
  const organization = await adminService.updateOrganization({
    organizationId,
    ...input
  });

  await auditLogService.record(request.auth ?? null, {
    organizationId,
    action: "organization.updated",
    entityType: "organization",
    entityId: organizationId,
    metadata: {
      name: organization.name,
      slug: organization.slug,
      status: organization.status
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: organization });
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
