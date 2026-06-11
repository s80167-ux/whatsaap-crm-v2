import { apiDelete, apiGet, apiPatch, apiPost } from "../../../lib/http";
import { config } from "../../../lib/config";
import type {
  Campaign,
  CampaignAttachment,
  CampaignRecipient,
  CampaignRecipientSendStatus,
  CampaignSpeedPreset,
  CampaignStats,
  CampaignTempo
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

function toSafeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campaign";
}
