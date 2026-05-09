export type CampaignStatus = "Draft" | "Scheduled" | "Sending" | "Completed" | "Failed";

export type AudienceSource = "Upload CSV" | "Existing CRM Contacts";

export type CampaignContact = {
  name: string;
  phone: string;
  tag?: string | null;
  gender?: "male" | "female" | null;
};

export type Campaign = {
  id: string;
  name: string;
  audience: string;
  status: CampaignStatus;
  recipients: number;
  sent: number;
  failed: number;
  replied: number;
  createdAt: string;
};

export type CampaignStats = {
  total: number;
  draft: number;
  scheduled: number;
  sent: number;
  failed: number;
  replied: number;
};
