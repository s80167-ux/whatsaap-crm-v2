import { apiGet, apiPatch, apiPost } from "../lib/http";
import type { CampaignRiskGuardReview } from "../modules/campaigns/types/campaign.types";

export type SafetyStatus = "pass" | "warning" | "blocked";
export type SpamRiskLevel = "low" | "medium" | "high" | "critical";

export type CampaignSafetySettings = {
  organization_id: string;
  whatsapp_daily_limit: number;
  per_account_daily_limit: number;
  send_rate_per_minute: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  auto_pause_enabled: boolean;
  auto_pause_failure_rate: string | number;
  auto_pause_min_sent: number;
  recent_contact_cooldown_hours: number;
  require_opt_out_text: boolean;
  block_high_spam_risk: boolean;
};

export type ContentRiskResult = {
  spam_risk_score: number;
  spam_risk_level: SpamRiskLevel;
  warnings: string[];
  suggestions: string[];
  detected_patterns: string[];
  detected_risk_keywords: string[];
  message_length: number;
  link_count: number;
  has_opt_out_text: boolean;
  variable_errors: string[];
  spintax_errors?: string[];
  uppercase_ratio?: number;
  emoji_count?: number;
};

export type CampaignPrecheck = {
  campaign_id: string;
  campaign_name: string;
  organization_id: string;
  safety_status: SafetyStatus;
  safety_score: number;
  can_start: boolean;
  blocking_errors: string[];
  warnings: string[];
  recipient_summary: {
    total: number;
    valid: number;
    invalid_phone: number;
    duplicate: number;
    opted_out: number;
    missing_phone: number;
    already_contacted_recently: number;
    excluded: number;
  };
  content_summary: ContentRiskResult;
  sending_summary: {
    selected_whatsapp_account_id: string | null;
    account_status: string;
    daily_limit: number;
    sent_today: number;
    remaining_today: number;
    estimated_duration_minutes: number;
    rate_limit_per_minute: number;
    pacing_delay_seconds: number;
  };
};

export type OptOutPreference = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  normalized_phone: string;
  channel: string;
  status: "allowed" | "opted_out" | "blocked";
  reason: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

function buildQuery(input?: {
  organizationId?: string | null;
  status?: string | null;
  search?: string | null;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input?.organizationId) params.set("organization_id", input.organizationId);
  if (input?.status) params.set("status", input.status);
  if (input?.search) params.set("search", input.search);
  if (input?.limit) params.set("limit", String(input.limit));
  return params.size > 0 ? `?${params.toString()}` : "";
}

export async function getCampaignSafetyPrecheck(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiGet<{ data: CampaignPrecheck }>(
    `/campaign-safety/campaigns/${input.campaignId}/precheck${buildQuery({ organizationId: input.organizationId })}`
  );
  return response.data;
}

export async function validateCampaignRecipients(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: CampaignPrecheck["recipient_summary"] }>(
    `/campaign-safety/campaigns/${input.campaignId}/validate-recipients`,
    { organizationId: input.organizationId, organization_id: input.organizationId }
  );
  return response.data;
}

export async function checkCampaignContentRisk(input: { message: string }) {
  const response = await apiPost<{ data: ContentRiskResult }>("/campaign-safety/content-check", {
    message: input.message,
    channel: "whatsapp"
  });
  return response.data;
}

export async function getCampaignSafetySettings(input?: { organizationId?: string | null }) {
  const response = await apiGet<{ data: CampaignSafetySettings }>(`/campaign-safety/settings${buildQuery(input)}`);
  return response.data;
}

export async function updateCampaignSafetySettings(input: Partial<CampaignSafetySettings> & { organizationId?: string | null }) {
  const response = await apiPatch<{ data: CampaignSafetySettings }>("/campaign-safety/settings", {
    ...input,
    organization_id: input.organizationId
  });
  return response.data;
}

export async function listCampaignOptOuts(input?: { organizationId?: string | null; status?: string | null; search?: string | null; limit?: number }) {
  const response = await apiGet<{ data: OptOutPreference[] }>(`/campaign-safety/opt-outs${buildQuery(input)}`);
  return response.data;
}

export async function upsertCampaignOptOut(input: {
  organizationId?: string | null;
  phoneNumber: string;
  status: "allowed" | "opted_out" | "blocked";
  reason?: string | null;
}) {
  const response = await apiPost<{ data: OptOutPreference }>("/campaign-safety/opt-outs", {
    organizationId: input.organizationId,
    organization_id: input.organizationId,
    phoneNumber: input.phoneNumber,
    status: input.status,
    reason: input.reason ?? null,
    source: "manual"
  });
  return response.data;
}

export async function overrideCampaignSafetyWarnings(input: {
  campaignId: string;
  organizationId?: string | null;
  warningCodes: string[];
  note?: string | null;
}) {
  const response = await apiPost<{ data: unknown }>(`/campaign-safety/campaigns/${input.campaignId}/override-warning`, {
    organizationId: input.organizationId,
    organization_id: input.organizationId,
    warning_codes: input.warningCodes,
    note: input.note ?? null
  });
  return response.data;
}

export async function getCampaignRiskGuardReview(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiGet<{ data: CampaignRiskGuardReview }>(
    `/campaign-safety/campaigns/${input.campaignId}/risk-guard${buildQuery({ organizationId: input.organizationId })}`
  );
  return response.data;
}

export async function applyCampaignRiskGuardSuggestions(input: {
  campaignId: string;
  reviewId: string;
  organizationId?: string | null;
  applyTempo?: boolean;
  applyMessageOverride?: boolean;
  markDecision?: "applied_suggestions" | "partially_applied" | "ignored_warning" | "saved_as_draft";
}) {
  const response = await apiPost<{ data: CampaignRiskGuardReview }>(
    `/campaign-safety/campaigns/${input.campaignId}/risk-guard/apply`,
    {
      organizationId: input.organizationId,
      organization_id: input.organizationId,
      review_id: input.reviewId,
      apply_tempo: input.applyTempo ?? false,
      apply_message_override: input.applyMessageOverride ?? false,
      mark_decision: input.markDecision ?? "applied_suggestions"
    }
  );
  return response.data;
}
