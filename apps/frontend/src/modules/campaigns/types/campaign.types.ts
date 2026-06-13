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
  fileSizeBytes: number;
  dataBase64?: string;
  mediaId?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  mediaUrl?: string | null;
  legacyInline?: boolean;
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
  selectedMessageTemplateId?: string | null;
  activeSafetyReviewId?: string | null;
  activeMessageOverrideId?: string | null;
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
  failedSenderIssue?: number;
  failedOther?: number;
  skipped?: number;
  replied: number;
  pauseReason?: string | null;
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

export type CampaignRecipientSendStatus = "pending" | "queued" | "sending" | "sent" | "failed" | "skipped" | "opted_out";

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
  messageBodyRendered?: string | null;
  deliveredAt?: string | null;
  repliedAt?: string | null;
  optOutDetected?: boolean;
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
  warmerStatus?: string | null;
  currentDay?: number | null;
  warmupDays?: number | null;
  sentToday: number;
  baseDailyLimit: number;
  suggestedDailyLimit: number;
  exceededBy: number;
  isAboveSuggestedLimit: boolean;
};

export type RiskLevel = "low" | "medium" | "high";
export type SenderHealthStatus = "Good" | "Caution" | "Risky" | "Cooling Down";

export type TemplateRiskSnapshot = {
  riskLevel: RiskLevel;
  statusLabel: "Template Safety: Good" | "Template Safety: Needs Review" | "Template Safety: High Risk";
  issues: string[];
  suggestions: string[];
  metrics: {
    hasOptOutLine: boolean;
    messageLength: number;
    linkCount: number;
    emojiCount: number;
    uppercaseRatio: number;
    variableIssues: string[];
  };
  suggestedOverrideBody?: string | null;
};

export type AudienceRiskSnapshot = {
  audienceGroupId: string | null;
  permissionStatus: string;
  sourceType: string | null;
  riskLevel: RiskLevel;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  suppressedRows: number;
};

export type SenderRiskSnapshot = {
  senderHealth: SenderHealthStatus;
  senderCount: number;
  sentToday: number;
  failedRecently: number;
  optOutRepliesRecently: number;
  disconnectedRecently: number;
  reasons: string[];
  recommendedMode: "Safe Start Mode" | "Conservative sending" | "Normal sending";
};

export type TempoRiskSnapshot = {
  riskLevel: RiskLevel;
  aggressive: boolean;
  current: {
    batchSize: number;
    delayPerMessageSeconds: number;
    batchPauseSeconds: number;
    dailyLimit: number;
  };
  suggested: {
    batchSize: number;
    delayPerMessageSeconds: number;
    batchPauseSeconds: number;
    dailyLimit: number;
    speedPreset: CampaignSpeedPreset;
  };
  recommendedTestBatchSize: number;
  warnings: string[];
};

export type CampaignRiskGuardReview = {
  reviewId: string;
  overallRiskLevel: RiskLevel;
  audience: AudienceRiskSnapshot;
  template: TemplateRiskSnapshot;
  sender: SenderRiskSnapshot;
  tempo: TempoRiskSnapshot;
  detectedIssues: string[];
  suggestedActions: string[];
  recommendedChanges: Array<{
    type: "tempo" | "message_override" | "exclude_invalid" | "exclude_suppressed" | "test_batch";
    label: string;
    currentValue?: string | null;
    suggestedValue?: string | null;
  }>;
  userDecision: "pending" | "applied_suggestions" | "partially_applied" | "ignored_warning" | "saved_as_draft";
  overridePreviewBody?: string | null;
};
