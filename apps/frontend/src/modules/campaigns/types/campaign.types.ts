export type CampaignStatus = "Draft" | "Scheduled" | "Sending" | "Completed" | "Failed";

export type CampaignSpeedPreset = "safe" | "normal" | "custom";

export type CampaignContact = {
  name: string;
  phone: string;
  tag?: string | null;
  gender?: "male" | "female" | "unknown" | null;
};

export type Campaign = {
  id: string;
  name: string;
  audience: string;
  audienceGroupId?: string | null;
  audienceGroupName?: string | null;
  audienceValidCount?: number;
  senderWhatsAppAccountId?: string | null;
  senderWhatsAppLabel?: string | null;
  senderPhoneNumber?: string | null;
  speedPreset?: CampaignSpeedPreset;
  delayPerMessageSeconds?: number;
  batchSize?: number;
  batchPauseSeconds?: number;
  dailyLimit?: number;
  stopOnHighFailure?: boolean;
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

export type CampaignTempo = {
  speedPreset: CampaignSpeedPreset;
  delayPerMessageSeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  dailyLimit: number;
  stopOnHighFailure: boolean;
};
