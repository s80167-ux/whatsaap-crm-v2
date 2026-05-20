import { apiGet, apiPatch, apiPost } from "../lib/http";

export type TemplateType = "campaign_message" | "quick_reply" | "email_placeholder";
export type TemplateStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";

export type TemplateGovernanceSettings = {
  organization_id: string;
  approval_required: boolean;
  allow_agent_custom_templates: boolean;
  auto_approve_org_admin_templates: boolean;
  lock_approved_templates: boolean;
};

export type GovernedTemplate = {
  template_id: string;
  template_type: TemplateType;
  source_template_id: string | null;
  title: string;
  category: string | null;
  current_status: TemplateStatus;
  active_version_id: string | null;
  active_version_number: number | null;
  active_snapshot: TemplateSnapshot | null;
  active_body: string | null;
  latest_version_number: number | null;
  last_updated_at: string;
  last_approved_at: string | null;
  created_by: string | null;
  approved_by: string | null;
  usage_count: number;
  send_count: number;
  response_rate: number;
};

export type TemplateSnapshot = {
  title: string;
  body: string;
  variables?: string[];
  variable_defaults?: Record<string, string>;
  variable_definitions?: unknown[];
  category?: string | null;
};

export type TemplateVersion = {
  version_id: string;
  id?: string;
  template_id?: string;
  version_number: number;
  status: TemplateStatus;
  title: string;
  body_preview?: string;
  snapshot?: TemplateSnapshot;
  variables?: string[];
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  approval_status?: TemplateStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  rendered_preview?: string;
};

export type TemplateDiff = {
  field_changes: Array<{ field: string; before: unknown; after: unknown }>;
  body_diff: { before: string; after: string; changed: boolean };
  variable_changes: { added: string[]; removed: string[] };
  metadata_changes: Record<string, unknown>;
};

function buildQuery(input?: {
  organizationId?: string | null;
  templateType?: TemplateType | null;
  status?: TemplateStatus | null;
  search?: string | null;
  limit?: number;
  offset?: number;
  compareToVersionId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input?.organizationId) params.set("organization_id", input.organizationId);
  if (input?.templateType) params.set("template_type", input.templateType);
  if (input?.status) params.set("status", input.status);
  if (input?.search) params.set("search", input.search);
  if (input?.limit) params.set("limit", String(input.limit));
  if (input?.offset) params.set("offset", String(input.offset));
  if (input?.compareToVersionId) params.set("compare_to_version_id", input.compareToVersionId);
  return params.size > 0 ? `?${params.toString()}` : "";
}

export async function getTemplateGovernanceSettings(input?: { organizationId?: string | null }) {
  const response = await apiGet<{ data: TemplateGovernanceSettings }>(`/template-governance/settings${buildQuery(input)}`);
  return response.data;
}

export async function updateTemplateGovernanceSettings(input: Partial<TemplateGovernanceSettings> & { organizationId?: string | null }) {
  const response = await apiPatch<{ data: TemplateGovernanceSettings }>("/template-governance/settings", {
    ...input,
    organization_id: input.organizationId
  });
  return response.data;
}

export async function getGovernedTemplates(input?: Parameters<typeof buildQuery>[0]) {
  const response = await apiGet<{ data: GovernedTemplate[] }>(`/template-governance/templates${buildQuery(input)}`);
  return response.data;
}

export async function createGovernedTemplate(input: {
  organizationId?: string | null;
  template_type: TemplateType;
  title: string;
  body: string;
  variables?: string[];
  variable_defaults?: Record<string, string>;
  category?: string | null;
  change_summary?: string | null;
}) {
  const response = await apiPost<{ data: { template: GovernedTemplate; version: TemplateVersion } }>("/template-governance/templates", {
    ...input,
    organization_id: input.organizationId
  });
  return response.data;
}

export async function getTemplateVersions(input: { templateId: string; organizationId?: string | null; templateType?: TemplateType | null }) {
  const response = await apiGet<{ data: TemplateVersion[] }>(
    `/template-governance/templates/${input.templateId}/versions${buildQuery({
      organizationId: input.organizationId,
      templateType: input.templateType
    })}`
  );
  return response.data;
}

export async function getTemplateVersion(input: { templateId: string; versionId: string; organizationId?: string | null }) {
  const response = await apiGet<{ data: TemplateVersion }>(
    `/template-governance/templates/${input.templateId}/versions/${input.versionId}${buildQuery({ organizationId: input.organizationId })}`
  );
  return response.data;
}

export async function getTemplateDiff(input: {
  templateId: string;
  versionId: string;
  compareToVersionId: string;
  organizationId?: string | null;
}) {
  const response = await apiGet<{ data: TemplateDiff }>(
    `/template-governance/templates/${input.templateId}/versions/${input.versionId}/diff${buildQuery({
      organizationId: input.organizationId,
      compareToVersionId: input.compareToVersionId
    })}`
  );
  return response.data;
}

export async function createTemplateVersion(input: {
  templateId: string;
  organizationId?: string | null;
  template_type: TemplateType;
  title: string;
  body: string;
  variables?: string[];
  variable_defaults?: Record<string, string>;
  category?: string | null;
  change_summary?: string | null;
}) {
  const response = await apiPost<{ data: TemplateVersion }>(`/template-governance/templates/${input.templateId}/versions`, {
    ...input,
    organization_id: input.organizationId
  });
  return response.data;
}

export async function submitTemplateForReview(input: { templateId: string; versionId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: TemplateVersion }>(
    `/template-governance/templates/${input.templateId}/versions/${input.versionId}/submit-review`,
    { organizationId: input.organizationId, organization_id: input.organizationId }
  );
  return response.data;
}

export async function approveTemplateVersion(input: { templateId: string; versionId: string; organizationId?: string | null; note?: string | null }) {
  const response = await apiPost<{ data: TemplateVersion }>(
    `/template-governance/templates/${input.templateId}/versions/${input.versionId}/approve`,
    { organizationId: input.organizationId, organization_id: input.organizationId, note: input.note ?? null }
  );
  return response.data;
}

export async function rejectTemplateVersion(input: { templateId: string; versionId: string; organizationId?: string | null; note: string }) {
  const response = await apiPost<{ data: TemplateVersion }>(
    `/template-governance/templates/${input.templateId}/versions/${input.versionId}/reject`,
    { organizationId: input.organizationId, organization_id: input.organizationId, note: input.note }
  );
  return response.data;
}

export async function rollbackTemplateVersion(input: {
  templateId: string;
  versionId: string;
  organizationId?: string | null;
  change_summary?: string | null;
  submit_for_review?: boolean;
}) {
  const response = await apiPost<{ data: TemplateVersion }>(
    `/template-governance/templates/${input.templateId}/versions/${input.versionId}/rollback`,
    {
      organizationId: input.organizationId,
      organization_id: input.organizationId,
      change_summary: input.change_summary,
      submit_for_review: input.submit_for_review
    }
  );
  return response.data;
}

export async function archiveGovernedTemplate(input: { templateId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: GovernedTemplate }>(`/template-governance/templates/${input.templateId}/archive`, {
    organizationId: input.organizationId,
    organization_id: input.organizationId
  });
  return response.data;
}
