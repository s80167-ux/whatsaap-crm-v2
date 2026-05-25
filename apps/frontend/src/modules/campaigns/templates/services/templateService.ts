import {
  archiveGovernedTemplate,
  createGovernedTemplate,
  createTemplateVersion,
  getGovernedTemplates,
  type GovernedTemplate
} from "../../../../api/templateGovernance";
import type { MessageTemplate, MessageTemplateCategory, TemplateFormDraft, TemplateStats } from "../types/template.types";
import { extractTemplateVariables } from "../utils/templateVariables";

const governedTemplateType = "campaign_message" as const;
const superAdminOrganizationKey = "crm_super_admin_organization_id";
const validCategories = new Set<MessageTemplateCategory>([
  "Promotion",
  "Reminder",
  "Follow Up",
  "Re-engagement",
  "Announcement",
  "Support",
  "Custom"
]);

export async function fetchMessageTemplates(organizationId?: string | null) {
  const scopedOrganizationId = resolveScopedOrganizationId(organizationId);
  const templates = await getGovernedTemplates({
    organizationId: scopedOrganizationId,
    templateType: governedTemplateType,
    limit: 200
  });

  return templates.map((template) => mapGovernedTemplateToMessageTemplate(template, scopedOrganizationId));
}

export async function createMessageTemplate(input: TemplateFormDraft & { organizationId?: string | null }) {
  const title = input.name.trim();
  const body = input.content.trim();
  const scopedOrganizationId = resolveScopedOrganizationId(input.organizationId);

  if (!title) {
    throw new Error("Template name is required.");
  }

  if (!body) {
    throw new Error("Message content is required.");
  }

  await createGovernedTemplate({
    organizationId: scopedOrganizationId,
    template_type: governedTemplateType,
    title,
    body,
    variables: extractTemplateVariables(input.content),
    category: input.category,
    change_summary: "Created from WhatsApp Message Templates"
  });

  return getMostRecentTemplate(scopedOrganizationId, title);
}

export async function updateMessageTemplate(input: TemplateFormDraft & { templateId: string; organizationId?: string | null }) {
  const title = input.name.trim();
  const body = input.content.trim();
  const scopedOrganizationId = resolveScopedOrganizationId(input.organizationId);

  if (!title) {
    throw new Error("Template name is required.");
  }

  if (!body) {
    throw new Error("Message content is required.");
  }

  await createTemplateVersion({
    templateId: input.templateId,
    organizationId: scopedOrganizationId,
    template_type: governedTemplateType,
    title,
    body,
    variables: extractTemplateVariables(input.content),
    category: input.category,
    change_summary: "Updated from WhatsApp Message Templates"
  });

  return getTemplateById(input.templateId, scopedOrganizationId);
}

export async function duplicateMessageTemplate(templateId: string, organizationId?: string | null) {
  const scopedOrganizationId = resolveScopedOrganizationId(organizationId);
  const source = await getTemplateById(templateId, scopedOrganizationId);

  await createGovernedTemplate({
    organizationId: scopedOrganizationId,
    template_type: governedTemplateType,
    title: `${source.name} Copy`,
    body: source.content,
    variables: source.variables,
    category: source.category,
    change_summary: `Duplicated from ${source.name}`
  });

  return getMostRecentTemplate(scopedOrganizationId, `${source.name} Copy`);
}

export async function archiveMessageTemplate(templateId: string, organizationId?: string | null) {
  const scopedOrganizationId = resolveScopedOrganizationId(organizationId);
  await archiveGovernedTemplate({ templateId, organizationId: scopedOrganizationId });
  return getTemplateById(templateId, scopedOrganizationId);
}

export async function deleteMessageTemplate(templateId: string, organizationId?: string | null) {
  const scopedOrganizationId = resolveScopedOrganizationId(organizationId);
  await archiveGovernedTemplate({ templateId, organizationId: scopedOrganizationId });
  return { ok: true };
}

export function getTemplateStats(templates: MessageTemplate[]): TemplateStats {
  return {
    total: templates.length,
    active: templates.filter((template) => template.status === "Active").length,
    draft: templates.filter((template) => template.status === "Draft").length,
    archived: templates.filter((template) => template.status === "Archived").length
  };
}

async function getTemplateById(templateId: string, organizationId?: string | null) {
  const templates = await fetchMessageTemplates(organizationId);
  const template = templates.find((item) => item.id === templateId);

  if (!template) {
    throw new Error("Template not found.");
  }

  return template;
}

async function getMostRecentTemplate(organizationId: string | null | undefined, title: string) {
  const templates = await fetchMessageTemplates(organizationId);
  return templates.find((template) => template.name === title) ?? templates[0];
}

function resolveScopedOrganizationId(organizationId: string | null | undefined) {
  if (organizationId !== undefined) {
    return organizationId;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(superAdminOrganizationKey) || null;
  } catch {
    return null;
  }
}

function mapGovernedTemplateToMessageTemplate(template: GovernedTemplate, organizationId?: string | null): MessageTemplate {
  const snapshot = template.active_snapshot ?? null;
  const content = template.active_body ?? snapshot?.body ?? "";
  const category = normalizeCategory(template.category ?? snapshot?.category ?? null);
  const variables = Array.isArray(snapshot?.variables) ? snapshot.variables : extractTemplateVariables(content);
  const updatedAt = template.last_updated_at ?? new Date().toISOString();

  return {
    id: template.template_id,
    organization_id: organizationId ?? null,
    name: template.title,
    category,
    description: null,
    content,
    attachments: [],
    variables,
    status: mapGovernanceStatus(template.current_status),
    created_by: template.created_by ?? null,
    created_at: template.last_approved_at ?? updatedAt,
    updated_at: updatedAt,
    archived_at: template.current_status === "archived" ? updatedAt : null
  };
}

function normalizeCategory(value?: string | null): MessageTemplateCategory {
  if (value && validCategories.has(value as MessageTemplateCategory)) {
    return value as MessageTemplateCategory;
  }

  return "Custom";
}

function mapGovernanceStatus(status: GovernedTemplate["current_status"]): MessageTemplate["status"] {
  if (status === "approved") {
    return "Active";
  }

  if (status === "archived") {
    return "Archived";
  }

  return "Draft";
}
