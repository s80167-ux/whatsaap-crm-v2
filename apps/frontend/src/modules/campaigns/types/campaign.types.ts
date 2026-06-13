export type CampaignStatus = "Draft" | "Scheduled" | "Sending" | "Paused" | "Completed" | "Failed" | "Cancelled";

export type CampaignSpeedPreset = "very_safe" | "safe" | "balanced" | "normal" | "fast" | "custom";

export type CampaignContact = {
  name: string;
  phone: string;
  tag?: string | null;
  gender?: "male" | "female" | "unknown" | null;
};

export type CampaignAttachment = {
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  dataBase64: string;
  fileSizeBytes: number;
};

export type Campaign = {
  id: string;
  name: string;
  audience: string;
  audienceGroupId?: string | null;
  audienceGroupName?: string | null;
  audienceValidCount?: number;
  senderWhatsAppAccountId?: string | null;
  senderWhatsAppAccountIds?: string[];
  senderWhatsAppLabel?: string | null;
  senderPhoneNumber?: string | null;
  messageTemplate?: string | null;
  attachment?: CampaignAttachment | null;
  attachContactCard?: boolean;
  speedPreset?: CampaignSpeedPreset;
  delayPerMessageSeconds?: number;
  batchSize?: number;
  batchPauseSeconds?: number;
  dailyLimit?: number;
  stopOnHighFailure?: boolean;
  status: CampaignStatus;
  recipients: number;
  pending?: number;
  queued?: number;
  sent: number;
  failed: number;
  skipped?: number;
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

export type CampaignRecipientSendStatus = "pending" | "queued" | "sent" | "failed" | "skipped";

export type CampaignRecipient = {
  id: string;
  campaignId: string;
  audienceGroupContactId?: string | null;
  crmContactId?: string | null;
  name?: string | null;
  phoneNormalized: string;
  gender: "male" | "female" | "unknown";
  salutation?: string | null;
  tag?: string | null;
  location?: string | null;
  productInterest?: string | null;
  customerType?: string | null;
  notes?: string | null;
  sendStatus: CampaignRecipientSendStatus;
  messageId?: string | null;
  attemptCount: number;
  queuedAt?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  nextAttemptAt?: string | null;
  errorMessage?: string | null;
  validationStatus?: string | null;
  validationReason?: string | null;
  normalizedPhone?: string | null;
  excludedAt?: string | null;
  excludedReason?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
  lastAttemptAt?: string | null;
  safetyExclusionReason?: string | null;
  createdAt: string;
};

export type CampaignWarmupAdvisory = {
  whatsappAccountId: string;
  senderLabel?: string | null;
  senderPhoneNumber?: string | null;
  connectionStatus: string;
  warmupStartedAt?: string | null;
  warmupLevel: number;
  sentToday: number;
  baseDailyLimit: number;
  suggestedDailyLimit: number;
  exceededBy: number;
  isAboveSuggestedLimit: boolean;
};
