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

const updateOrganizationSchema = createOrganizationSchema.extend({
  status: z.enum(["active", "trial", "suspended", "closed"]).optional()
});

const updateCampaignsModuleSchema = z.object({
  isEnabled: z.boolean()
});

const organizationModuleParamsSchema = z.object({
  organizationId: z.string().uuid(),
  moduleKey: z.enum(["campaigns", "campaign", "campaign.whatsapp", "campaign.email", "ai_message_assist", "inbox", "crm", "sales"])
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

export async function listOrganizationModules(request: Request, response: Response) {
  const organizationId = z.string().uuid().parse(request.params.organizationId);
  const modules = await adminService.listOrganizationModules(organizationId);

  return response.json({ data: modules });
}

export async function updateCampaignsModule(request: Request, response: Response) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  const { organizationId, moduleKey } = organizationModuleParamsSchema.parse(request.params);
  const input = updateCampaignsModuleSchema.parse(request.body);
  const module =
    moduleKey === "ai_message_assist"
      ? await adminService.updateAiMessageAssistModule(request.auth, organizationId, input.isEnabled)
      : await adminService.updateOrganizationModule(request.auth, organizationId, moduleKey, input.isEnabled);

  await auditLogService.record(request.auth, {
    organizationId,
    action: "organization_module.updated",
    entityType: "organization_module",
    entityId: module.id ?? organizationId,
    metadata: {
      module_key: moduleKey,
      is_enabled: input.isEnabled
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: module });
}
