import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { TemplateGovernanceService } from "../../services/templateGovernanceService.js";

const templateGovernanceService = new TemplateGovernanceService();

const listTemplatesQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  template_type: z.enum(["campaign_message", "quick_reply", "email_placeholder"]).optional(),
  status: z.enum(["draft", "pending_review", "approved", "rejected", "archived"]).optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const templateParamsSchema = z.object({
  templateId: z.string().uuid()
});

const versionParamsSchema = templateParamsSchema.extend({
  versionId: z.string().uuid()
});

const versionDiffQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  compare_to_version_id: z.string().uuid()
});

const createTemplateBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  template_type: z.enum(["campaign_message", "quick_reply", "email_placeholder"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  variables: z.array(z.string().trim().min(1).max(80)).optional(),
  variable_defaults: z.record(z.string()).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  change_summary: z.string().trim().max(500).optional().nullable()
});

const createVersionBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  template_type: z.enum(["campaign_message", "quick_reply", "email_placeholder"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  variables: z.array(z.string().trim().min(1).max(80)).optional(),
  variable_defaults: z.record(z.string()).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  change_summary: z.string().trim().max(500).optional().nullable()
});

const reviewBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable()
});

const rejectBodySchema = reviewBodySchema.extend({
  note: z.string().trim().min(1).max(1000)
});

const rollbackBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  change_summary: z.string().trim().max(500).optional().nullable(),
  submit_for_review: z.boolean().optional()
});

const settingsBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  approval_required: z.boolean().optional(),
  allow_agent_custom_templates: z.boolean().optional(),
  auto_approve_org_admin_templates: z.boolean().optional(),
  lock_approved_templates: z.boolean().optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }
  return request.auth;
}

function bodyOrganizationId(input: { organizationId?: string | null; organization_id?: string | null }) {
  return input.organizationId ?? input.organization_id ?? null;
}

export async function listTemplates(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = listTemplatesQuerySchema.parse(request.query);
  const templates = await templateGovernanceService.listTemplates(auth, {
    organizationId: input.organization_id,
    templateType: input.template_type,
    status: input.status,
    search: input.search,
    limit: input.limit,
    offset: input.offset
  });
  return response.json({ data: templates });
}

export async function createTemplate(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createTemplateBodySchema.parse(request.body);
  const result = await templateGovernanceService.createTemplate(auth, {
    organizationId: bodyOrganizationId(input),
    templateType: input.template_type,
    title: input.title,
    body: input.body,
    variables: input.variables,
    variable_defaults: input.variable_defaults,
    category: input.category,
    change_summary: input.change_summary
  });
  return response.status(201).json({ data: result });
}

export async function listVersions(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = templateParamsSchema.parse(request.params);
  const query = listTemplatesQuerySchema.pick({ organization_id: true, template_type: true }).parse(request.query);
  const versions = await templateGovernanceService.listVersions(auth, {
    organizationId: query.organization_id,
    templateId: params.templateId,
    templateType: query.template_type
  });
  return response.json({ data: versions });
}

export async function getVersion(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = versionParamsSchema.parse(request.params);
  const query = organizationQuerySchema.parse(request.query);
  const version = await templateGovernanceService.getVersion(auth, {
    organizationId: query.organization_id,
    templateId: params.templateId,
    versionId: params.versionId
  });
  return response.json({ data: version });
}

export async function getDiff(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = versionParamsSchema.parse(request.params);
  const query = versionDiffQuerySchema.parse(request.query);
  const diff = await templateGovernanceService.getDiff(auth, {
    organizationId: query.organization_id,
    templateId: params.templateId,
    versionId: params.versionId,
    compareToVersionId: query.compare_to_version_id
  });
  return response.json({ data: diff });
}

export async function createVersion(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = templateParamsSchema.parse(request.params);
  const input = createVersionBodySchema.parse(request.body);
  const version = await templateGovernanceService.createVersion(auth, {
    organizationId: bodyOrganizationId(input),
    templateId: params.templateId,
    templateType: input.template_type,
    title: input.title,
    body: input.body,
    variables: input.variables,
    variable_defaults: input.variable_defaults,
    category: input.category,
    change_summary: input.change_summary
  });
  return response.status(201).json({ data: version });
}

export async function submitReview(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = versionParamsSchema.parse(request.params);
  const input = reviewBodySchema.parse(request.body);
  const version = await templateGovernanceService.submitReview(auth, {
    organizationId: bodyOrganizationId(input),
    templateId: params.templateId,
    versionId: params.versionId
  });
  return response.json({ data: version });
}

export async function approveVersion(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = versionParamsSchema.parse(request.params);
  const input = reviewBodySchema.parse(request.body);
  const version = await templateGovernanceService.approve(auth, {
    organizationId: bodyOrganizationId(input),
    templateId: params.templateId,
    versionId: params.versionId,
    note: input.note
  });
  return response.json({ data: version });
}

export async function rejectVersion(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = versionParamsSchema.parse(request.params);
  const input = rejectBodySchema.parse(request.body);
  const version = await templateGovernanceService.reject(auth, {
    organizationId: bodyOrganizationId(input),
    templateId: params.templateId,
    versionId: params.versionId,
    note: input.note
  });
  return response.json({ data: version });
}

export async function rollbackVersion(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = versionParamsSchema.parse(request.params);
  const input = rollbackBodySchema.parse(request.body);
  const version = await templateGovernanceService.rollback(auth, {
    organizationId: bodyOrganizationId(input),
    templateId: params.templateId,
    versionId: params.versionId,
    change_summary: input.change_summary,
    submit_for_review: input.submit_for_review
  });
  return response.status(201).json({ data: version });
}

export async function archiveTemplate(request: Request, response: Response) {
  const auth = requireAuth(request);
  const params = templateParamsSchema.parse(request.params);
  const input = reviewBodySchema.parse(request.body);
  const template = await templateGovernanceService.archive(auth, {
    organizationId: bodyOrganizationId(input),
    templateId: params.templateId
  });
  return response.json({ data: template });
}

export async function getSettings(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = organizationQuerySchema.parse(request.query);
  const settings = await templateGovernanceService.getSettings(auth, { organizationId: input.organization_id });
  return response.json({ data: settings });
}

export async function updateSettings(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = settingsBodySchema.parse(request.body);
  const settings = await templateGovernanceService.updateSettings(auth, {
    organizationId: bodyOrganizationId(input),
    approval_required: input.approval_required,
    allow_agent_custom_templates: input.allow_agent_custom_templates,
    auto_approve_org_admin_templates: input.auto_approve_org_admin_templates,
    lock_approved_templates: input.lock_approved_templates
  });
  return response.json({ data: settings });
}
