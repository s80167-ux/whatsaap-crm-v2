import { apiDelete, apiGet, apiPatch, apiPost, isApiError } from "../../../lib/http";
import { config } from "../../../lib/config";
import type {
  Campaign,
  CampaignAttachment,
  CampaignRecipient,
  CampaignRecipientSendStatus,
  CampaignSpeedPreset,
  CampaignStats,
  CampaignTempo,
  CampaignWarmupAdvisory
} from "../types/campaign.types";

export const mockCampaigns: Campaign[] = [
  {
    id: "campaign-001",
    name: "Raya Returning Customers",
    audience: "Existing CRM Contacts",
    audienceGroupId: null,
    senderWhatsAppAccountId: null,
    speedPreset: "safe",
    delayPerMessageSeconds: 12,
    batchSize: 20,
    batchPauseSeconds: 120,
    dailyLimit: 300,
    stopOnHighFailure: true,
    status: "Draft",
    recipients: 240,
    sent: 0,
    failed: 0,
    replied: 0,
    createdAt: "2026-05-01"
  },
  {
    id: "campaign-002",
    name: "May Promo Follow-up",
    audience: "Upload CSV",
    status: "Scheduled",
    recipients: 510,
    sent: 0,
    failed: 0,
    replied: 0,
    createdAt: "2026-05-04"
  },
  {
    id: "campaign-003",
    name: "VIP Upgrade Offer",
    audience: "Existing CRM Contacts",
    status: "Completed",
    recipients: 180,
    sent: 174,
    failed: 6,
    replied: 39,
    createdAt: "2026-04-28"
  },
  {
    id: "campaign-004",
    name: "Inactive Lead Reconnect",
    audience: "Existing CRM Contacts",
    status: "Failed",
    recipients: 95,
    sent: 41,
    failed: 54,
    replied: 3,
    createdAt: "2026-04-21"
  }
];

export function getMockCampaignStats(campaigns: Campaign[]): CampaignStats {
  return {
    total: campaigns.length,
    draft: campaigns.filter((campaign) => campaign.status === "Draft").length,
    scheduled: campaigns.filter((campaign) => campaign.status === "Scheduled").length,
    sent: campaigns.reduce((sum, campaign) => sum + campaign.sent, 0),
    failed: campaigns.reduce((sum, campaign) => sum + campaign.failed, 0),
    replied: campaigns.reduce((sum, campaign) => sum + campaign.replied, 0)
  };
}

export function getCampaignStats(campaigns: Campaign[]): CampaignStats {
  return {
    total: campaigns.length,
    draft: campaigns.filter((campaign) => campaign.status === "Draft").length,
    scheduled: campaigns.filter((campaign) => campaign.status === "Scheduled" || campaign.status === "Paused").length,
    sent: campaigns.reduce((sum, campaign) => sum + campaign.sent, 0),
    failed: campaigns.reduce((sum, campaign) => sum + campaign.failed, 0),
    replied: campaigns.reduce((sum, campaign) => sum + campaign.replied, 0)
  };
}

export type CreateCampaignInput = {
  organizationId?: string | null;
  name: string;
  senderWhatsAppAccountId?: string;
  senderWhatsAppAccountIds?: string[];
  senderMode?: "single" | "round_robin";
  audienceGroupId: string;
  messageTemplate?: string;
  templateGovernanceVersionId?: string | null;
  tempo: CampaignTempo;
  attachment?: CampaignAttachment | null;
  attachContactCard?: boolean;
};

export type UpdateCampaignInput = Partial<CreateCampaignInput> & {
  campaignId: string;
};

export async function fetchCampaigns(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: Campaign[] }>(`/campaigns${suffix}`);
  return response.data;
}

export async function fetchCampaignRecipients(input: {
  campaignId: string;
  organizationId?: string | null;
  status?: CampaignRecipientSendStatus | "all";
  q?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();

  if (input.organizationId) {
    params.set("organization_id", input.organizationId);
  }

  if (input.status && input.status !== "all") {
    params.set("status", input.status);
  }

  if (input.q?.trim()) {
    params.set("q", input.q.trim());
  }

  params.set("page", String(input.page ?? 1));
  params.set("limit", String(input.limit ?? 50));

  const response = await apiGet<{
    data: CampaignRecipient[];
    pagination: { page: number; limit: number; total: number };
  }>(`/campaigns/${input.campaignId}/recipients?${params.toString()}`);

  return response;
}

export async function fetchCampaignWarmupAdvisory(input: {
  campaignId: string;
  organizationId?: string | null;
}) {
  const params = new URLSearchParams();

  if (input.organizationId) {
    params.set("organization_id", input.organizationId);
  }

  const suffix = params.toString();
  const response = await apiGet<{ data: CampaignWarmupAdvisory[] }>(
    `/campaigns/${input.campaignId}/warmup-advisory${suffix ? `?${suffix}` : ""}`
  );

  return response.data;
}

export async function downloadCampaignRecipients(input: {
  campaignId: string;
  campaignName: string;
  organizationId?: string | null;
  status?: CampaignRecipientSendStatus | "all";
  q?: string;
}) {
  const params = new URLSearchParams();

  if (input.organizationId) {
    params.set("organization_id", input.organizationId);
  }

  if (input.status && input.status !== "all") {
    params.set("status", input.status);
  }

  if (input.q?.trim()) {
    params.set("q", input.q.trim());
  }

  const response = await fetch(
    `${config.apiBaseUrl}/campaigns/${input.campaignId}/recipients/export?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Unable to download campaign recipients (${response.status}).`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${toSafeFilename(input.campaignName)}-recipients.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function createCampaign(input: CreateCampaignInput) {
  const response = await apiPost<{ data: Campaign }>("/campaigns", input);
  return response.data;
}

export async function updateCampaign(input: UpdateCampaignInput) {
  const response = await apiPatch<{ data: Campaign }>(`/campaigns/${input.campaignId}`, input);
  return response.data;
}

export async function sendCampaignTest(input: {
  campaignId?: string;
  organizationId?: string | null;
  senderWhatsAppAccountId: string;
  testPhoneNumber: string;
  messageTemplate?: string;
  templateGovernanceVersionId?: string | null;
  attachment?: CampaignAttachment | null;
  attachContactCard?: boolean;
}) {
  const path = input.campaignId ? `/campaigns/${input.campaignId}/send-test` : "/campaigns/preview/send-test";
  const response = await apiPost<{ data: { ok: true; message: string } }>(path, input);
  return response.data;
}

export async function startCampaign(input: {
  campaignId?: string;
  organizationId?: string | null;
  senderWhatsAppAccountId?: string;
  senderWhatsAppAccountIds?: string[];
  senderMode?: "single" | "round_robin";
  audienceGroupId?: string;
  messageTemplate?: string;
  templateGovernanceVersionId?: string | null;
  speedPreset?: CampaignSpeedPreset;
  attachment?: CampaignAttachment | null;
  attachContactCard?: boolean;
}) {
  const path = input.campaignId ? `/campaigns/${input.campaignId}/start` : "/campaigns/preview/start";
  const response = await apiPost<{ data: { ok: true; message: string } }>(path, input);
  return response.data;
}

export async function pauseCampaign(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: { ok: true; message: string; campaign: Campaign | null } }>(
    `/campaigns/${input.campaignId}/pause`,
    input
  );
  return response.data;
}

export async function resumeCampaign(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: { ok: true; message: string; campaign: Campaign | null } }>(
    `/campaigns/${input.campaignId}/resume`,
    input
  );
  return response.data;
}

export async function cancelCampaign(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: { ok: true; message: string; campaign: Campaign | null } }>(
    `/campaigns/${input.campaignId}/cancel`,
    input
  );
  return response.data;
}

export async function deleteCampaign(input: { campaignId: string; organizationId?: string | null }) {
  const suffix = input.organizationId ? `?organization_id=${encodeURIComponent(input.organizationId)}` : "";
  return apiDelete<{ ok: true; message: string }>(`/campaigns/${input.campaignId}${suffix}`);
}

type CampaignSafetyDetails = {
  blocking_errors?: string[];
  warnings?: string[];
  content_summary?: {
    spintax_errors?: string[];
    variable_errors?: string[];
  };
  sending_summary?: {
    account_status?: string;
    remaining_today?: number;
  };
  recipient_summary?: {
    valid?: number;
  };
};

export function formatCampaignStartError(error: unknown) {
  if (isApiError(error)) {
    const details = (error.details ?? null) as CampaignSafetyDetails | null;

    if (error.code === "campaign_safety_blocked") {
      const blockingErrors = details?.blocking_errors ?? [];
      if (blockingErrors.includes("spintax_syntax_error")) {
        const reason = details?.content_summary?.spintax_errors?.[0] ?? "Message template contains invalid brace syntax.";
        return `Campaign blocked: ${reason}`;
      }
      if (blockingErrors.includes("required_variables_missing")) {
        const reason = details?.content_summary?.variable_errors?.[0] ?? "Campaign message uses invalid or missing template variables.";
        return `Campaign blocked: ${reason}`;
      }
      if (blockingErrors.includes("whatsapp_account_disconnected")) {
        return "Campaign blocked: the selected WhatsApp sender is not connected.";
      }
      if (blockingErrors.includes("daily_limit_reached")) {
        return "Campaign blocked: the selected sender has reached its daily sending limit.";
      }
      if (blockingErrors.includes("no_valid_recipients")) {
        return "Campaign blocked: there are no recipients left who passed safety validation.";
      }
    }

    if (error.code === "campaign_safety_warning_ack_required") {
      const warnings = details?.warnings?.length ? details.warnings.join(", ") : "campaign safety warnings";
      return `Review required before start: ${warnings}. Open Review to inspect the safety warnings.`;
    }
  }

  return error instanceof Error ? error.message : "Unable to start campaign.";
}

function toSafeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campaign";
}
