export type ModuleKey = "campaigns" | "campaign" | "campaign.whatsapp" | "campaign.email" | "ai_message_assist";

export interface OrganizationModule {
  id: string;
  organization_id: string;
  module_key: ModuleKey;
  is_enabled: boolean;
  enabled_by: string | null;
  enabled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationModuleStatus {
  organizationId: string;
  moduleKey: ModuleKey;
  isEnabled: boolean;
}

export interface OrganizationAccessLimits {
  organizationId: string;
  modules: Array<{
    moduleKey: ModuleKey;
    isEnabled: boolean;
  }>;
  limits: {
    maxWhatsappAccounts: number;
    historySyncDays: number;
    maxUsers?: number | null;
    aiDailyCredits: number;
    aiMonthlyCredits: number;
    campaignMonthlyCount: number;
    campaignRecipientsPerCampaign: number;
    campaignTemplatesCount: number;
    campaignAudienceSegments: number;
    campaignScheduledCount: number;
    campaignWhatsAppMessagesPerDay: number;
    campaignWhatsAppMessagesPerMonth: number;
    campaignWhatsAppRecipientsPerBroadcast: number;
    campaignWhatsAppDelaySecondsMin: number;
    campaignWhatsAppDelaySecondsMax: number;
    campaignWhatsAppMaxConnectors: number;
    campaignWhatsAppRequireApproval: boolean;
    campaignEmailEmailsPerDay: number;
    campaignEmailEmailsPerMonth: number;
    campaignEmailRecipientsPerBlast: number;
    campaignEmailVerifiedDomains: number;
    campaignEmailRequireUnsubscribe: boolean;
  };
  usage: {
    whatsappAccounts: number;
    campaign: {
      whatsappSentToday: number;
      whatsappSentThisMonth: number;
      whatsappFailedThisMonth: number;
      emailSentThisMonth: number | null;
    };
    ai: {
      today: AiUsageWindow;
      month: AiUsageWindow;
    };
  };
  coreFeatures: {
    whatsappCrm: {
      availableByDefault: boolean;
    };
  };
}

export interface AiUsageWindow {
  requests: number;
  deepseekRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  creditUnits: number;
  lastUsedAt: string | null;
}
