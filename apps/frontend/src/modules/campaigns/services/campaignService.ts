import type { Campaign, CampaignStats } from "../types/campaign.types";

export const mockCampaigns: Campaign[] = [
  {
    id: "campaign-001",
    name: "Raya Returning Customers",
    audience: "Existing CRM Contacts",
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
