import { apiGet, apiPatch, apiPost } from "../../../lib/http";
import type { Campaign, CampaignSpeedPreset, CampaignStats, CampaignTempo } from "../types/campaign.types";

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
  senderWhatsAppAccountId: string;
  audienceGroupId: string;
  messageTemplate: string;
  tempo: CampaignTempo;
};

export type UpdateCampaignInput = Partial<CreateCampaignInput> & {
  campaignId: string;
};

export async function fetchCampaigns(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: Campaign[] }>(`/campaigns${suffix}`);
  return response.data;
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
  messageTemplate: string;
}) {
  const path = input.campaignId ? `/campaigns/${input.campaignId}/send-test` : "/campaigns/preview/send-test";
  const response = await apiPost<{ data: { ok: true; message: string } }>(path, input);
  return response.data;
}

export async function startCampaign(input: {
  campaignId?: string;
  organizationId?: string | null;
  senderWhatsAppAccountId: string;
  audienceGroupId: string;
  messageTemplate: string;
  speedPreset: CampaignSpeedPreset;
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
