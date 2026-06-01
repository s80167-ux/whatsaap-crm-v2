import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import type { PoolClient } from "pg";
import { OrganizationAdminRepository } from "../repositories/organizationAdminRepository.js";
import { GoogleSignupRequestRepository, type GoogleSignupRequestStatus } from "../repositories/googleSignupRequestRepository.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";
import { UserAdminRepository } from "../repositories/userAdminRepository.js";
import { WhatsAppAdminRepository } from "../repositories/whatsAppAdminRepository.js";
import {
  WhatsAppAccountAccessRepository,
  type WhatsAppAccountAccessInput
} from "../repositories/whatsAppAccountAccessRepository.js";
import { AuthService } from "./authService.js";
import type { AuthUser, UserRole } from "../types/auth.js";
import { RawEventProcessorService } from "./rawEventProcessorService.js";
import { ConnectorClient } from "./connectorClient.js";

const LEGACY_CAMPAIGNS_MODULE_KEY = "campaigns";
const CAMPAIGN_MODULE_KEY = "campaign";
const CAMPAIGN_WHATSAPP_MODULE_KEY = "campaign.whatsapp";
const CAMPAIGN_EMAIL_MODULE_KEY = "campaign.email";
const AI_MESSAGE_ASSIST_MODULE_KEY = "ai_message_assist";
const INBOX_MODULE_KEY = "inbox";
const CRM_MODULE_KEY = "crm";
const SALES_MODULE_KEY = "sales";
const SUPPORTED_MODULE_KEYS = [
  LEGACY_CAMPAIGNS_MODULE_KEY,
  CAMPAIGN_MODULE_KEY,
  CAMPAIGN_WHATSAPP_MODULE_KEY,
  CAMPAIGN_EMAIL_MODULE_KEY,
  AI_MESSAGE_ASSIST_MODULE_KEY,
  INBOX_MODULE_KEY,
  CRM_MODULE_KEY,
  SALES_MODULE_KEY
] as const;
const MAX_WHATSAPP_ACCOUNTS_KEY = "max_whatsapp_accounts";
const HISTORY_SYNC_DAYS_KEY = "history_sync_days";
const MAX_USERS_KEY = "max_users";
const AI_DAILY_CREDITS_KEY = "ai_daily_credits";
const AI_MONTHLY_CREDITS_KEY = "ai_monthly_credits";
const CAMPAIGN_MONTHLY_COUNT_KEY = "campaign.monthly_count";
const CAMPAIGN_RECIPIENTS_PER_CAMPAIGN_KEY = "campaign.recipients_per_campaign";
const CAMPAIGN_TEMPLATES_COUNT_KEY = "campaign.templates_count";
const CAMPAIGN_AUDIENCE_SEGMENTS_KEY = "campaign.audience_segments";
const CAMPAIGN_SCHEDULED_COUNT_KEY = "campaign.scheduled_count";
const CAMPAIGN_WHATSAPP_MESSAGES_PER_DAY_KEY = "campaign.whatsapp.messages_per_day";
const CAMPAIGN_WHATSAPP_MESSAGES_PER_MONTH_KEY = "campaign.whatsapp.messages_per_month";
const CAMPAIGN_WHATSAPP_RECIPIENTS_PER_BROADCAST_KEY = "campaign.whatsapp.recipients_per_broadcast";
const CAMPAIGN_WHATSAPP_DELAY_SECONDS_MIN_KEY = "campaign.whatsapp.delay_seconds_min";
const CAMPAIGN_WHATSAPP_DELAY_SECONDS_MAX_KEY = "campaign.whatsapp.delay_seconds_max";
const CAMPAIGN_WHATSAPP_MAX_CONNECTORS_KEY = "campaign.whatsapp.max_connectors";
const CAMPAIGN_WHATSAPP_REQUIRE_APPROVAL_KEY = "campaign.whatsapp.require_approval";
const CAMPAIGN_EMAIL_EMAILS_PER_DAY_KEY = "campaign.email.emails_per_day";
const CAMPAIGN_EMAIL_EMAILS_PER_MONTH_KEY = "campaign.email.emails_per_month";
const CAMPAIGN_EMAIL_RECIPIENTS_PER_BLAST_KEY = "campaign.email.recipients_per_blast";
const CAMPAIGN_EMAIL_VERIFIED_DOMAINS_KEY = "campaign.email.verified_domains";
const CAMPAIGN_EMAIL_REQUIRE_UNSUBSCRIBE_KEY = "campaign.email.require_unsubscribe";
const DEFAULT_MAX_WHATSAPP_ACCOUNTS = 1;
const DEFAULT_HISTORY_SYNC_DAYS = 7;
const DEFAULT_AI_DAILY_CREDITS = 100;
const DEFAULT_AI_MONTHLY_CREDITS = 1000;
const DEFAULT_CAMPAIGN_MONTHLY_COUNT = 20;
const DEFAULT_CAMPAIGN_RECIPIENTS_PER_CAMPAIGN = 1000;
const DEFAULT_CAMPAIGN_TEMPLATES_COUNT = 25;
const DEFAULT_CAMPAIGN_AUDIENCE_SEGMENTS = 10;
const DEFAULT_CAMPAIGN_SCHEDULED_COUNT = 10;
const DEFAULT_CAMPAIGN_WHATSAPP_MESSAGES_PER_DAY = 500;
const DEFAULT_CAMPAIGN_WHATSAPP_MESSAGES_PER_MONTH = 10000;
const DEFAULT_CAMPAIGN_WHATSAPP_RECIPIENTS_PER_BROADCAST = 1000;
const DEFAULT_CAMPAIGN_WHATSAPP_DELAY_SECONDS_MIN = 3;
const DEFAULT_CAMPAIGN_WHATSAPP_DELAY_SECONDS_MAX = 15;
const DEFAULT_CAMPAIGN_WHATSAPP_MAX_CONNECTORS = 3;
const DEFAULT_CAMPAIGN_WHATSAPP_REQUIRE_APPROVAL = 0;
const DEFAULT_CAMPAIGN_EMAIL_EMAILS_PER_DAY = 0;
const DEFAULT_CAMPAIGN_EMAIL_EMAILS_PER_MONTH = 0;
const DEFAULT_CAMPAIGN_EMAIL_RECIPIENTS_PER_BLAST = 0;
const DEFAULT_CAMPAIGN_EMAIL_VERIFIED_DOMAINS = 0;
const DEFAULT_CAMPAIGN_EMAIL_REQUIRE_UNSUBSCRIBE = 1;

type OrganizationLimitKey =
  | typeof MAX_WHATSAPP_ACCOUNTS_KEY
  | typeof HISTORY_SYNC_DAYS_KEY
  | typeof MAX_USERS_KEY
  | typeof AI_DAILY_CREDITS_KEY
  | typeof AI_MONTHLY_CREDITS_KEY
  | typeof CAMPAIGN_MONTHLY_COUNT_KEY
  | typeof CAMPAIGN_RECIPIENTS_PER_CAMPAIGN_KEY
  | typeof CAMPAIGN_TEMPLATES_COUNT_KEY
  | typeof CAMPAIGN_AUDIENCE_SEGMENTS_KEY
  | typeof CAMPAIGN_SCHEDULED_COUNT_KEY
  | typeof CAMPAIGN_WHATSAPP_MESSAGES_PER_DAY_KEY
  | typeof CAMPAIGN_WHATSAPP_MESSAGES_PER_MONTH_KEY
  | typeof CAMPAIGN_WHATSAPP_RECIPIENTS_PER_BROADCAST_KEY
  | typeof CAMPAIGN_WHATSAPP_DELAY_SECONDS_MIN_KEY
  | typeof CAMPAIGN_WHATSAPP_DELAY_SECONDS_MAX_KEY
  | typeof CAMPAIGN_WHATSAPP_MAX_CONNECTORS_KEY
  | typeof CAMPAIGN_WHATSAPP_REQUIRE_APPROVAL_KEY
  | typeof CAMPAIGN_EMAIL_EMAILS_PER_DAY_KEY
  | typeof CAMPAIGN_EMAIL_EMAILS_PER_MONTH_KEY
  | typeof CAMPAIGN_EMAIL_RECIPIENTS_PER_BLAST_KEY
  | typeof CAMPAIGN_EMAIL_VERIFIED_DOMAINS_KEY
  | typeof CAMPAIGN_EMAIL_REQUIRE_UNSUBSCRIBE_KEY;

type OrganizationAccessLimitsUpdateInput = {
  campaignsEnabled?: boolean;
  campaignEnabled?: boolean;
  campaignWhatsAppEnabled?: boolean;
  campaignEmailEnabled?: boolean;
  aiMessageAssistEnabled?: boolean;
  inboxEnabled?: boolean;
  crmEnabled?: boolean;
  salesEnabled?: boolean;
  maxWhatsappAccounts?: number;
  historySyncDays?: number;
  maxUsers?: number | null;
  aiDailyCredits?: number;
  aiMonthlyCredits?: number;
  campaignMonthlyCount?: number;
  campaignRecipientsPerCampaign?: number;
  campaignTemplatesCount?: number;
  campaignAudienceSegments?: number;
  campaignScheduledCount?: number;
  campaignWhatsAppMessagesPerDay?: number;
  campaignWhatsAppMessagesPerMonth?: number;
  campaignWhatsAppRecipientsPerBroadcast?: number;
  campaignWhatsAppDelaySecondsMin?: number;
  campaignWhatsAppDelaySecondsMax?: number;
  campaignWhatsAppMaxConnectors?: number;
  campaignWhatsAppRequireApproval?: boolean;
  campaignEmailEmailsPerDay?: number;
  campaignEmailEmailsPerMonth?: number;
  campaignEmailRecipientsPerBlast?: number;
  campaignEmailVerifiedDomains?: number;
  campaignEmailRequireUnsubscribe?: boolean;
};

type AiUsageWindow = {
  requests: number;
  deepseekRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  creditUnits: number;
  lastUsedAt: string | null;
};

const EMPTY_AI_USAGE_WINDOW: AiUsageWindow = {
  requests: 0,
  deepseekRequests: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  creditUnits: 0,
  lastUsedAt: null
};

type AiUsageSourceBreakdown = {
  inbox: AiUsageWindow;
  campaign: AiUsageWindow;
  template: AiUsageWindow;
  other: AiUsageWindow;
};

const EMPTY_AI_USAGE_SOURCE_BREAKDOWN: AiUsageSourceBreakdown = {
  inbox: EMPTY_AI_USAGE_WINDOW,
  campaign: EMPTY_AI_USAGE_WINDOW,
  template: EMPTY_AI_USAGE_WINDOW,
  other: EMPTY_AI_USAGE_WINDOW
};

export type OrganizationModuleKey = (typeof SUPPORTED_MODULE_KEYS)[number];

function getModuleLookupKeys(moduleKey: OrganizationModuleKey) {
  switch (moduleKey) {
    case CAMPAIGN_MODULE_KEY:
    case CAMPAIGN_WHATSAPP_MODULE_KEY:
      return [moduleKey, LEGACY_CAMPAIGNS_MODULE_KEY] as const;
    default:
      return [moduleKey] as const;
  }
}

function getMissingModuleDefault(moduleKey: OrganizationModuleKey) {
  return moduleKey === INBOX_MODULE_KEY || moduleKey === CRM_MODULE_KEY || moduleKey === SALES_MODULE_KEY;
}

function slugifyOrganizationName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canManageOrganizationWhatsAppAccounts(authUser: AuthUser) {
  return authUser.role === "super_admin" || authUser.role === "org_admin";
}

function canManageWhatsAppAccount(authUser: AuthUser, account: { organization_id: string; created_by?: string | null }) {
  if (authUser.role === "super_admin") {
    return true;
  }

  if (account.organization_id !== authUser.organizationId) {
    return false;
  }

  if (authUser.role === "org_admin") {
    return true;
  }

  return Boolean(authUser.organizationUserId && account.created_by === authUser.organizationUserId);
}

function canManageWhatsAppNumberAccess(authUser: AuthUser, organizationId: string) {
  if (authUser.role === "super_admin") {
    return true;
  }

  if (authUser.organizationId !== organizationId) {
    return false;
  }

  return authUser.role === "org_admin" || authUser.role === "manager";
}

function isMissingRelationError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42P01";
}

export class AdminService {
  constructor(
    private readonly organizationRepository = new OrganizationAdminRepository(),
    private readonly userRepository = new UserAdminRepository(),
    private readonly googleSignupRequestRepository = new GoogleSignupRequestRepository(),
    private readonly whatsappRepository = new WhatsAppAdminRepository(),
    private readonly whatsappAccessRepository = new WhatsAppAccountAccessRepository(),
    private readonly rawEventRepository = new RawEventRepository(),
    private readonly authService = new AuthService(),
    private readonly rawEventProcessorService = new RawEventProcessorService(),
    private readonly connectorClient = new ConnectorClient()
  ) {}

  async listOrganizations() {
    const client = await pool.connect();
    try {
      return await this.organizationRepository.list(client);
    } finally {
      client.release();
    }
  }

  async createOrganization(input: { name: string; slug?: string | null }) {
    return withTransaction(async (client) => {
      const slug = input.slug?.trim() || slugifyOrganizationName(input.name);
      return this.organizationRepository.create(client, {
        name: input.name.trim(),
        slug
      });
    });
  }

  async updateOrganization(input: {
    organizationId: string;
    name: string;
    slug?: string | null;
    status?: "active" | "trial" | "suspended" | "closed";
  }) {
    return withTransaction(async (client) => {
      const organization = await this.organizationRepository.update(client, input.organizationId, {
        name: input.name.trim(),
        slug: input.slug?.trim() || slugifyOrganizationName(input.name),
        status: input.status
      });

      if (!organization) {
        throw new AppError("Organization not found", 404, "organization_not_found");
      }

      return organization;
    });
  }

  async deleteOrganization(organizationId: string) {
    return withTransaction(async (client) => {
      const organization = await this.organizationRepository.softDelete(client, organizationId);

      if (!organization) {
        throw new Error("Organization not found");
      }

      return organization;
    });
  }

  async getOrganizationModuleStatus(authUser: AuthUser, moduleKey: OrganizationModuleKey, organizationId?: string | null) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId) {
      return {
        organizationId: null,
        moduleKey,
        isEnabled: false
      };
    }

    const client = await pool.connect();
    try {
      const lookupKeys = getModuleLookupKeys(moduleKey);
      const result = await client.query<{ is_enabled: boolean }>(
        `
          select is_enabled
          from organization_modules
          where organization_id = $1
            and module_key = any($2::text[])
          order by case when module_key = $3 then 0 else 1 end
          limit 1
        `,
        [resolvedOrganizationId, lookupKeys, moduleKey]
      );

      return {
        organizationId: resolvedOrganizationId,
        moduleKey,
        isEnabled: result.rows[0]?.is_enabled ?? getMissingModuleDefault(moduleKey)
      };
    } finally {
      client.release();
    }
  }

  async getCampaignsModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, LEGACY_CAMPAIGNS_MODULE_KEY, organizationId);
  }

  async getCampaignModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, CAMPAIGN_MODULE_KEY, organizationId);
  }

  async getCampaignWhatsAppModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, CAMPAIGN_WHATSAPP_MODULE_KEY, organizationId);
  }

  async getCampaignEmailModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, CAMPAIGN_EMAIL_MODULE_KEY, organizationId);
  }

  async getAiMessageAssistModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, AI_MESSAGE_ASSIST_MODULE_KEY, organizationId);
  }

  async getInboxModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, INBOX_MODULE_KEY, organizationId);
  }

  async getCrmModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, CRM_MODULE_KEY, organizationId);
  }

  async getSalesModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    return this.getOrganizationModuleStatus(authUser, SALES_MODULE_KEY, organizationId);
  }

  async listOrganizationModules(organizationId: string) {
    const client = await pool.connect();
    try {
      const result = await client.query<{
        id: string;
        organization_id: string;
        module_key: string;
        is_enabled: boolean;
        enabled_by: string | null;
        enabled_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          select
            id,
            organization_id,
            module_key,
            is_enabled,
            enabled_by,
            enabled_at,
            created_at,
            updated_at
          from organization_modules
          where organization_id = $1
          order by module_key asc
        `,
        [organizationId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  async updateCampaignsModule(authUser: AuthUser, organizationId: string, isEnabled: boolean) {
    return withTransaction((client) =>
      this.updateOrganizationModuleWithClient(client, authUser, organizationId, LEGACY_CAMPAIGNS_MODULE_KEY, isEnabled)
    );
  }

  async updateOrganizationModule(authUser: AuthUser, organizationId: string, moduleKey: OrganizationModuleKey, isEnabled: boolean) {
    return withTransaction((client) => this.updateOrganizationModuleWithClient(client, authUser, organizationId, moduleKey, isEnabled));
  }

  async updateAiMessageAssistModule(authUser: AuthUser, organizationId: string, isEnabled: boolean) {
    return withTransaction((client) =>
      this.updateOrganizationModuleWithClient(client, authUser, organizationId, AI_MESSAGE_ASSIST_MODULE_KEY, isEnabled)
    );
  }

  private async updateOrganizationModuleWithClient(
    client: PoolClient,
    authUser: AuthUser,
    organizationId: string,
    moduleKey: OrganizationModuleKey,
    isEnabled: boolean
  ) {
    const result = await client.query<{
        id: string;
        organization_id: string;
        module_key: string;
        is_enabled: boolean;
        enabled_by: string | null;
        enabled_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          insert into organization_modules (
            organization_id,
            module_key,
            is_enabled,
            enabled_by,
            enabled_at,
            updated_at
          )
          values (
            $1,
            $2,
            $3,
            $4,
            case when $3 then timezone('utc', now()) else null end,
            timezone('utc', now())
          )
          on conflict (organization_id, module_key)
          do update set
            is_enabled = excluded.is_enabled,
            enabled_by = excluded.enabled_by,
            enabled_at = excluded.enabled_at,
            updated_at = timezone('utc', now())
          returning
            id,
            organization_id,
            module_key,
            is_enabled,
            enabled_by,
            enabled_at,
            created_at,
            updated_at
        `,
        [organizationId, moduleKey, isEnabled, authUser.authUserId ?? null]
      );

    return result.rows[0];
  }

  private async getOrganizationLimitValueWithClient(
    client: PoolClient,
    organizationId: string,
    limitKey: OrganizationLimitKey,
    defaultValue: number | null
  ) {
    const result = await client.query<{ limit_value: number }>(
      `
        select limit_value
        from organization_limits
        where organization_id = $1
          and limit_key = $2
        limit 1
      `,
      [organizationId, limitKey]
    );

    return result.rows[0]?.limit_value ?? defaultValue;
  }

  async getOrganizationLimitValue(organizationId: string, limitKey: OrganizationLimitKey, defaultValue: number | null) {
    const client = await pool.connect();
    try {
      return this.getOrganizationLimitValueWithClient(client, organizationId, limitKey, defaultValue);
    } finally {
      client.release();
    }
  }

  private async updateOrganizationLimitWithClient(
    client: PoolClient,
    organizationId: string,
    limitKey: OrganizationLimitKey,
    value: number | null
  ) {
    if (value === null) {
      await client.query(
        `
          delete from organization_limits
          where organization_id = $1
            and limit_key = $2
        `,
        [organizationId, limitKey]
      );
      return null;
    }

    const result = await client.query<{
      id: string;
      organization_id: string;
      limit_key: string;
      limit_value: number;
      created_at: string;
      updated_at: string;
    }>(
      `
        insert into organization_limits (
          organization_id,
          limit_key,
          limit_value,
          updated_at
        )
        values ($1, $2, $3, timezone('utc', now()))
        on conflict (organization_id, limit_key)
        do update set
          limit_value = excluded.limit_value,
          updated_at = timezone('utc', now())
        returning
          id,
          organization_id,
          limit_key,
          limit_value,
          created_at,
          updated_at
      `,
      [organizationId, limitKey, value]
    );

    return result.rows[0];
  }

  async updateOrganizationLimit(organizationId: string, limitKey: OrganizationLimitKey, value: number | null) {
    return withTransaction((client) =>
      this.updateOrganizationLimitWithClient(client, organizationId, limitKey, value)
    );
  }

  private async getAiUsageWindowWithClient(client: PoolClient, organizationId: string, window: "day" | "month"): Promise<AiUsageWindow> {
    let result;

    try {
      result = await client.query<{
        requests: number;
        deepseek_requests: number;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        credit_units: number;
        last_used_at: string | null;
      }>(
        `
          select
            count(*)::int as requests,
            count(*) filter (where provider = 'deepseek')::int as deepseek_requests,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(credit_units), 0)::int as credit_units,
            max(created_at)::text as last_used_at
          from ai_usage_events
          where organization_id = $1
            and created_at >= date_trunc($2, now())
        `,
        [organizationId, window]
      );
    } catch (error) {
      if (isMissingRelationError(error)) {
        logger.warn(
          { organizationId, window },
          "AI usage events table is missing; returning zero usage until migration is applied"
        );
        return EMPTY_AI_USAGE_WINDOW;
      }

      throw error;
    }

    const row = result.rows[0];

    return {
      requests: row?.requests ?? 0,
      deepseekRequests: row?.deepseek_requests ?? 0,
      promptTokens: row?.prompt_tokens ?? 0,
      completionTokens: row?.completion_tokens ?? 0,
      totalTokens: row?.total_tokens ?? 0,
      creditUnits: row?.credit_units ?? 0,
      lastUsedAt: row?.last_used_at ?? null
    };
  }

  private async getAiUsageSourceBreakdownWithClient(
    client: PoolClient,
    organizationId: string,
    window: "day" | "month"
  ): Promise<AiUsageSourceBreakdown> {
    let result;

    try {
      result = await client.query<{
        source: string | null;
        requests: number;
        deepseek_requests: number;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        credit_units: number;
        last_used_at: string | null;
      }>(
        `
          select
            coalesce(nullif(source, ''), 'other') as source,
            count(*)::int as requests,
            count(*) filter (where provider = 'deepseek')::int as deepseek_requests,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(credit_units), 0)::int as credit_units,
            max(created_at)::text as last_used_at
          from ai_usage_events
          where organization_id = $1
            and created_at >= date_trunc($2, now())
          group by coalesce(nullif(source, ''), 'other')
        `,
        [organizationId, window]
      );
    } catch (error) {
      if (isMissingRelationError(error)) {
        logger.warn(
          { organizationId, window },
          "AI usage events table is missing; returning zero source usage until migration is applied"
        );
        return EMPTY_AI_USAGE_SOURCE_BREAKDOWN;
      }

      throw error;
    }

    const breakdown: AiUsageSourceBreakdown = {
      inbox: { ...EMPTY_AI_USAGE_WINDOW },
      campaign: { ...EMPTY_AI_USAGE_WINDOW },
      template: { ...EMPTY_AI_USAGE_WINDOW },
      other: { ...EMPTY_AI_USAGE_WINDOW }
    };

    for (const row of result.rows) {
      const source = row.source === "inbox" || row.source === "campaign" || row.source === "template" ? row.source : "other";
      breakdown[source] = {
        requests: row.requests ?? 0,
        deepseekRequests: row.deepseek_requests ?? 0,
        promptTokens: row.prompt_tokens ?? 0,
        completionTokens: row.completion_tokens ?? 0,
        totalTokens: row.total_tokens ?? 0,
        creditUnits: row.credit_units ?? 0,
        lastUsedAt: row.last_used_at ?? null
      };
    }

    return breakdown;
  }

  async assertAiUsageAllowed(authUser: AuthUser, organizationId: string) {
    const client = await pool.connect();
    try {
      const dailyUsage = await this.getAiUsageWindowWithClient(client, organizationId, "day");
      const monthlyUsage = await this.getAiUsageWindowWithClient(client, organizationId, "month");
      const dailyLimit = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        AI_DAILY_CREDITS_KEY,
        DEFAULT_AI_DAILY_CREDITS
      );
      const monthlyLimit = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        AI_MONTHLY_CREDITS_KEY,
        DEFAULT_AI_MONTHLY_CREDITS
      );

      if (dailyUsage.creditUnits >= (dailyLimit ?? DEFAULT_AI_DAILY_CREDITS)) {
        throw new AppError("This organization has reached its daily AI usage limit.", 403, "AI_DAILY_LIMIT_REACHED");
      }

      if (monthlyUsage.creditUnits >= (monthlyLimit ?? DEFAULT_AI_MONTHLY_CREDITS)) {
        throw new AppError("This organization has reached its monthly AI usage limit.", 403, "AI_MONTHLY_LIMIT_REACHED");
      }

      if (authUser.organizationId && authUser.organizationId !== organizationId && authUser.role !== "super_admin") {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }
    } finally {
      client.release();
    }
  }

  async recordAiUsage(
    authUser: AuthUser,
    organizationId: string,
    input: {
      source: string;
      action: string;
      provider: "deepseek" | "fallback";
      model: string | null;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      creditUnits: number;
    }
  ) {
    const client = await pool.connect();
    try {
      await client.query(
        `
          insert into ai_usage_events (
            organization_id,
            organization_user_id,
            auth_user_id,
            feature_key,
            source,
            action,
            provider,
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            credit_units
          )
          values ($1, $2, $3, 'ai_message_assist', $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          organizationId,
          authUser.organizationUserId ?? null,
          authUser.authUserId ?? null,
          input.source,
          input.action,
          input.provider,
          input.model,
          input.promptTokens,
          input.completionTokens,
          input.totalTokens,
          input.creditUnits
        ]
      );
    } catch (error) {
      if (isMissingRelationError(error)) {
        logger.warn(
          { organizationId, provider: input.provider, source: input.source, action: input.action },
          "AI usage event was not recorded because the usage table is missing"
        );
        return;
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async getOrganizationAccessLimits(authUser: AuthUser, organizationId: string) {
    if (authUser.role !== "super_admin") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    const client = await pool.connect();
    try {
      const campaignStatus = await this.getCampaignModuleStatus(authUser, organizationId);
      const campaignWhatsAppStatus = await this.getCampaignWhatsAppModuleStatus(authUser, organizationId);
      const campaignEmailStatus = await this.getCampaignEmailModuleStatus(authUser, organizationId);
      const aiMessageAssistStatus = await this.getAiMessageAssistModuleStatus(authUser, organizationId);
      const inboxStatus = await this.getInboxModuleStatus(authUser, organizationId);
      const crmStatus = await this.getCrmModuleStatus(authUser, organizationId);
      const salesStatus = await this.getSalesModuleStatus(authUser, organizationId);
      const maxWhatsappAccounts = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        MAX_WHATSAPP_ACCOUNTS_KEY,
        DEFAULT_MAX_WHATSAPP_ACCOUNTS
      );
      const historySyncDays = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        HISTORY_SYNC_DAYS_KEY,
        DEFAULT_HISTORY_SYNC_DAYS
      );
      const maxUsers = await this.getOrganizationLimitValueWithClient(client, organizationId, MAX_USERS_KEY, null);
      const aiDailyCredits = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        AI_DAILY_CREDITS_KEY,
        DEFAULT_AI_DAILY_CREDITS
      );
      const aiMonthlyCredits = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        AI_MONTHLY_CREDITS_KEY,
        DEFAULT_AI_MONTHLY_CREDITS
      );
      const campaignMonthlyCount = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_MONTHLY_COUNT_KEY,
        DEFAULT_CAMPAIGN_MONTHLY_COUNT
      );
      const campaignRecipientsPerCampaign = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_RECIPIENTS_PER_CAMPAIGN_KEY,
        DEFAULT_CAMPAIGN_RECIPIENTS_PER_CAMPAIGN
      );
      const campaignTemplatesCount = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_TEMPLATES_COUNT_KEY,
        DEFAULT_CAMPAIGN_TEMPLATES_COUNT
      );
      const campaignAudienceSegments = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_AUDIENCE_SEGMENTS_KEY,
        DEFAULT_CAMPAIGN_AUDIENCE_SEGMENTS
      );
      const campaignScheduledCount = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_SCHEDULED_COUNT_KEY,
        DEFAULT_CAMPAIGN_SCHEDULED_COUNT
      );
      const campaignWhatsAppMessagesPerDay = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_WHATSAPP_MESSAGES_PER_DAY_KEY,
        DEFAULT_CAMPAIGN_WHATSAPP_MESSAGES_PER_DAY
      );
      const campaignWhatsAppMessagesPerMonth = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_WHATSAPP_MESSAGES_PER_MONTH_KEY,
        DEFAULT_CAMPAIGN_WHATSAPP_MESSAGES_PER_MONTH
      );
      const campaignWhatsAppRecipientsPerBroadcast = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_WHATSAPP_RECIPIENTS_PER_BROADCAST_KEY,
        DEFAULT_CAMPAIGN_WHATSAPP_RECIPIENTS_PER_BROADCAST
      );
      const campaignWhatsAppDelaySecondsMin = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_WHATSAPP_DELAY_SECONDS_MIN_KEY,
        DEFAULT_CAMPAIGN_WHATSAPP_DELAY_SECONDS_MIN
      );
      const campaignWhatsAppDelaySecondsMax = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_WHATSAPP_DELAY_SECONDS_MAX_KEY,
        DEFAULT_CAMPAIGN_WHATSAPP_DELAY_SECONDS_MAX
      );
      const campaignWhatsAppMaxConnectors = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_WHATSAPP_MAX_CONNECTORS_KEY,
        DEFAULT_CAMPAIGN_WHATSAPP_MAX_CONNECTORS
      );
      const campaignWhatsAppRequireApproval = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_WHATSAPP_REQUIRE_APPROVAL_KEY,
        DEFAULT_CAMPAIGN_WHATSAPP_REQUIRE_APPROVAL
      );
      const campaignEmailEmailsPerDay = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_EMAIL_EMAILS_PER_DAY_KEY,
        DEFAULT_CAMPAIGN_EMAIL_EMAILS_PER_DAY
      );
      const campaignEmailEmailsPerMonth = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_EMAIL_EMAILS_PER_MONTH_KEY,
        DEFAULT_CAMPAIGN_EMAIL_EMAILS_PER_MONTH
      );
      const campaignEmailRecipientsPerBlast = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_EMAIL_RECIPIENTS_PER_BLAST_KEY,
        DEFAULT_CAMPAIGN_EMAIL_RECIPIENTS_PER_BLAST
      );
      const campaignEmailVerifiedDomains = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_EMAIL_VERIFIED_DOMAINS_KEY,
        DEFAULT_CAMPAIGN_EMAIL_VERIFIED_DOMAINS
      );
      const campaignEmailRequireUnsubscribe = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        CAMPAIGN_EMAIL_REQUIRE_UNSUBSCRIBE_KEY,
        DEFAULT_CAMPAIGN_EMAIL_REQUIRE_UNSUBSCRIBE
      );
      const whatsappAccounts = await this.whatsappRepository.countByOrganization(client, organizationId);
      const aiDailyUsage = await this.getAiUsageWindowWithClient(client, organizationId, "day");
      const aiMonthlyUsage = await this.getAiUsageWindowWithClient(client, organizationId, "month");
      const aiDailyUsageBySource = await this.getAiUsageSourceBreakdownWithClient(client, organizationId, "day");
      const aiMonthlyUsageBySource = await this.getAiUsageSourceBreakdownWithClient(client, organizationId, "month");
      const campaignUsage = await this.getCampaignUsageWithClient(client, organizationId);

      return {
        organizationId,
        modules: [
          {
            moduleKey: CAMPAIGN_MODULE_KEY,
            isEnabled: campaignStatus.isEnabled
          },
          {
            moduleKey: CAMPAIGN_WHATSAPP_MODULE_KEY,
            isEnabled: campaignWhatsAppStatus.isEnabled
          },
          {
            moduleKey: CAMPAIGN_EMAIL_MODULE_KEY,
            isEnabled: campaignEmailStatus.isEnabled
          },
          {
            moduleKey: AI_MESSAGE_ASSIST_MODULE_KEY,
            isEnabled: aiMessageAssistStatus.isEnabled
          },
          {
            moduleKey: INBOX_MODULE_KEY,
            isEnabled: inboxStatus.isEnabled
          },
          {
            moduleKey: CRM_MODULE_KEY,
            isEnabled: crmStatus.isEnabled
          },
          {
            moduleKey: SALES_MODULE_KEY,
            isEnabled: salesStatus.isEnabled
          }
        ],
        limits: {
          maxWhatsappAccounts: maxWhatsappAccounts ?? DEFAULT_MAX_WHATSAPP_ACCOUNTS,
          historySyncDays: historySyncDays ?? DEFAULT_HISTORY_SYNC_DAYS,
          maxUsers,
          aiDailyCredits: aiDailyCredits ?? DEFAULT_AI_DAILY_CREDITS,
          aiMonthlyCredits: aiMonthlyCredits ?? DEFAULT_AI_MONTHLY_CREDITS,
          campaignMonthlyCount: campaignMonthlyCount ?? DEFAULT_CAMPAIGN_MONTHLY_COUNT,
          campaignRecipientsPerCampaign:
            campaignRecipientsPerCampaign ?? DEFAULT_CAMPAIGN_RECIPIENTS_PER_CAMPAIGN,
          campaignTemplatesCount: campaignTemplatesCount ?? DEFAULT_CAMPAIGN_TEMPLATES_COUNT,
          campaignAudienceSegments: campaignAudienceSegments ?? DEFAULT_CAMPAIGN_AUDIENCE_SEGMENTS,
          campaignScheduledCount: campaignScheduledCount ?? DEFAULT_CAMPAIGN_SCHEDULED_COUNT,
          campaignWhatsAppMessagesPerDay:
            campaignWhatsAppMessagesPerDay ?? DEFAULT_CAMPAIGN_WHATSAPP_MESSAGES_PER_DAY,
          campaignWhatsAppMessagesPerMonth:
            campaignWhatsAppMessagesPerMonth ?? DEFAULT_CAMPAIGN_WHATSAPP_MESSAGES_PER_MONTH,
          campaignWhatsAppRecipientsPerBroadcast:
            campaignWhatsAppRecipientsPerBroadcast ?? DEFAULT_CAMPAIGN_WHATSAPP_RECIPIENTS_PER_BROADCAST,
          campaignWhatsAppDelaySecondsMin:
            campaignWhatsAppDelaySecondsMin ?? DEFAULT_CAMPAIGN_WHATSAPP_DELAY_SECONDS_MIN,
          campaignWhatsAppDelaySecondsMax:
            campaignWhatsAppDelaySecondsMax ?? DEFAULT_CAMPAIGN_WHATSAPP_DELAY_SECONDS_MAX,
          campaignWhatsAppMaxConnectors:
            campaignWhatsAppMaxConnectors ?? DEFAULT_CAMPAIGN_WHATSAPP_MAX_CONNECTORS,
          campaignWhatsAppRequireApproval: (campaignWhatsAppRequireApproval ?? DEFAULT_CAMPAIGN_WHATSAPP_REQUIRE_APPROVAL) > 0,
          campaignEmailEmailsPerDay: campaignEmailEmailsPerDay ?? DEFAULT_CAMPAIGN_EMAIL_EMAILS_PER_DAY,
          campaignEmailEmailsPerMonth: campaignEmailEmailsPerMonth ?? DEFAULT_CAMPAIGN_EMAIL_EMAILS_PER_MONTH,
          campaignEmailRecipientsPerBlast:
            campaignEmailRecipientsPerBlast ?? DEFAULT_CAMPAIGN_EMAIL_RECIPIENTS_PER_BLAST,
          campaignEmailVerifiedDomains: campaignEmailVerifiedDomains ?? DEFAULT_CAMPAIGN_EMAIL_VERIFIED_DOMAINS,
          campaignEmailRequireUnsubscribe: (campaignEmailRequireUnsubscribe ?? DEFAULT_CAMPAIGN_EMAIL_REQUIRE_UNSUBSCRIBE) > 0
        },
        usage: {
          whatsappAccounts,
          campaign: campaignUsage,
          ai: {
            today: aiDailyUsage,
            month: aiMonthlyUsage,
            bySource: {
              today: aiDailyUsageBySource,
              month: aiMonthlyUsageBySource
            }
          }
        },
        coreFeatures: {
          whatsappCrm: {
            availableByDefault: true
          }
        }
      };
    } finally {
      client.release();
    }
  }

  async updateOrganizationAccessLimits(
    authUser: AuthUser,
    organizationId: string,
    input: OrganizationAccessLimitsUpdateInput
  ) {
    if (authUser.role !== "super_admin") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    await withTransaction(async (client) => {
      if (input.campaignsEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(
          client,
          authUser,
          organizationId,
          LEGACY_CAMPAIGNS_MODULE_KEY,
          input.campaignsEnabled
        );
      }

      if (input.campaignEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(client, authUser, organizationId, CAMPAIGN_MODULE_KEY, input.campaignEnabled);
      }

      if (input.campaignWhatsAppEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(
          client,
          authUser,
          organizationId,
          CAMPAIGN_WHATSAPP_MODULE_KEY,
          input.campaignWhatsAppEnabled
        );
        await this.updateOrganizationModuleWithClient(
          client,
          authUser,
          organizationId,
          LEGACY_CAMPAIGNS_MODULE_KEY,
          input.campaignWhatsAppEnabled
        );
      }

      if (input.campaignEmailEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(client, authUser, organizationId, CAMPAIGN_EMAIL_MODULE_KEY, input.campaignEmailEnabled);
      }

      if (input.aiMessageAssistEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(
          client,
          authUser,
          organizationId,
          AI_MESSAGE_ASSIST_MODULE_KEY,
          input.aiMessageAssistEnabled
        );
      }

      if (input.inboxEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(client, authUser, organizationId, INBOX_MODULE_KEY, input.inboxEnabled);
      }

      if (input.crmEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(client, authUser, organizationId, CRM_MODULE_KEY, input.crmEnabled);
      }

      if (input.salesEnabled !== undefined) {
        await this.updateOrganizationModuleWithClient(client, authUser, organizationId, SALES_MODULE_KEY, input.salesEnabled);
      }

      if (input.maxWhatsappAccounts !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          MAX_WHATSAPP_ACCOUNTS_KEY,
          input.maxWhatsappAccounts
        );
      }

      if (input.historySyncDays !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, HISTORY_SYNC_DAYS_KEY, input.historySyncDays);
      }

      if (input.maxUsers !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, MAX_USERS_KEY, input.maxUsers);
      }

      if (input.aiDailyCredits !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, AI_DAILY_CREDITS_KEY, input.aiDailyCredits);
      }

      if (input.aiMonthlyCredits !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, AI_MONTHLY_CREDITS_KEY, input.aiMonthlyCredits);
      }

      if (input.campaignMonthlyCount !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, CAMPAIGN_MONTHLY_COUNT_KEY, input.campaignMonthlyCount);
      }

      if (input.campaignRecipientsPerCampaign !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_RECIPIENTS_PER_CAMPAIGN_KEY,
          input.campaignRecipientsPerCampaign
        );
      }

      if (input.campaignTemplatesCount !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, CAMPAIGN_TEMPLATES_COUNT_KEY, input.campaignTemplatesCount);
      }

      if (input.campaignAudienceSegments !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, CAMPAIGN_AUDIENCE_SEGMENTS_KEY, input.campaignAudienceSegments);
      }

      if (input.campaignScheduledCount !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, CAMPAIGN_SCHEDULED_COUNT_KEY, input.campaignScheduledCount);
      }

      if (input.campaignWhatsAppMessagesPerDay !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_WHATSAPP_MESSAGES_PER_DAY_KEY,
          input.campaignWhatsAppMessagesPerDay
        );
      }

      if (input.campaignWhatsAppMessagesPerMonth !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_WHATSAPP_MESSAGES_PER_MONTH_KEY,
          input.campaignWhatsAppMessagesPerMonth
        );
      }

      if (input.campaignWhatsAppRecipientsPerBroadcast !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_WHATSAPP_RECIPIENTS_PER_BROADCAST_KEY,
          input.campaignWhatsAppRecipientsPerBroadcast
        );
      }

      if (input.campaignWhatsAppDelaySecondsMin !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_WHATSAPP_DELAY_SECONDS_MIN_KEY,
          input.campaignWhatsAppDelaySecondsMin
        );
      }

      if (input.campaignWhatsAppDelaySecondsMax !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_WHATSAPP_DELAY_SECONDS_MAX_KEY,
          input.campaignWhatsAppDelaySecondsMax
        );
      }

      if (input.campaignWhatsAppMaxConnectors !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_WHATSAPP_MAX_CONNECTORS_KEY,
          input.campaignWhatsAppMaxConnectors
        );
      }

      if (input.campaignWhatsAppRequireApproval !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_WHATSAPP_REQUIRE_APPROVAL_KEY,
          input.campaignWhatsAppRequireApproval ? 1 : 0
        );
      }

      if (input.campaignEmailEmailsPerDay !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, CAMPAIGN_EMAIL_EMAILS_PER_DAY_KEY, input.campaignEmailEmailsPerDay);
      }

      if (input.campaignEmailEmailsPerMonth !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, CAMPAIGN_EMAIL_EMAILS_PER_MONTH_KEY, input.campaignEmailEmailsPerMonth);
      }

      if (input.campaignEmailRecipientsPerBlast !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_EMAIL_RECIPIENTS_PER_BLAST_KEY,
          input.campaignEmailRecipientsPerBlast
        );
      }

      if (input.campaignEmailVerifiedDomains !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, CAMPAIGN_EMAIL_VERIFIED_DOMAINS_KEY, input.campaignEmailVerifiedDomains);
      }

      if (input.campaignEmailRequireUnsubscribe !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          CAMPAIGN_EMAIL_REQUIRE_UNSUBSCRIBE_KEY,
          input.campaignEmailRequireUnsubscribe ? 1 : 0
        );
      }
    });

    return this.getOrganizationAccessLimits(authUser, organizationId);
  }

  private async getCampaignUsageWithClient(client: PoolClient, organizationId: string) {
    const [todayResult, monthResult, failedResult] = await Promise.all([
      client.query<{ count: number }>(
        `
          select count(*)::int as count
          from campaign_recipients
          where organization_id = $1
            and send_status = 'sent'
            and sent_at >= date_trunc('day', now())
        `,
        [organizationId]
      ),
      client.query<{ count: number }>(
        `
          select count(*)::int as count
          from campaign_recipients
          where organization_id = $1
            and send_status = 'sent'
            and sent_at >= date_trunc('month', now())
        `,
        [organizationId]
      ),
      client.query<{ count: number }>(
        `
          select count(*)::int as count
          from campaign_recipients
          where organization_id = $1
            and send_status = 'failed'
            and failed_at >= date_trunc('month', now())
        `,
        [organizationId]
      )
    ]);

    return {
      whatsappSentToday: todayResult.rows[0]?.count ?? 0,
      whatsappSentThisMonth: monthResult.rows[0]?.count ?? 0,
      whatsappFailedThisMonth: failedResult.rows[0]?.count ?? 0,
      emailSentThisMonth: null
    };
  }

  async listUsers(authUser: AuthUser, organizationId?: string) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? organizationId : authUser.organizationId;

    const client = await pool.connect();
    try {
      if (authUser.role === "super_admin" && !resolvedOrganizationId) {
        return await this.userRepository.listAll(client);
      }

      if (!resolvedOrganizationId) {
        throw new Error("organization_id is required");
      }

      return await this.userRepository.listByOrganization(client, resolvedOrganizationId);
    } finally {
      client.release();
    }
  }

  async createUser(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      email: string;
      fullName: string | null;
      avatarUrl?: string | null;
      password: string;
      role: UserRole;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId && input.role !== "super_admin") {
      throw new Error("organization_id is required");
    }

    if (authUser.role !== "super_admin" && input.role === "super_admin") {
      throw new Error("Only super_admin can create another super_admin");
    }

    return this.authService.createUser({
      organizationId: input.role === "super_admin" ? null : resolvedOrganizationId,
      email: input.email,
      fullName: input.fullName,
      avatarUrl: input.avatarUrl ?? null,
      password: input.password,
      role: input.role
    });
  }

  async listGoogleSignupRequests(authUser: AuthUser, status: GoogleSignupRequestStatus | "all" = "pending") {
    if (authUser.role !== "super_admin") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    const client = await pool.connect();
    try {
      return this.googleSignupRequestRepository.list(client, status);
    } finally {
      client.release();
    }
  }

  async approveGoogleSignupRequest(
    authUser: AuthUser,
    requestId: string,
    input: {
      organizationId: string;
      role: Exclude<UserRole, "super_admin">;
      fullName?: string | null;
    }
  ) {
    if (authUser.role !== "super_admin") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    return withTransaction(async (client) => {
      const request = await this.googleSignupRequestRepository.findById(client, requestId);

      if (!request || request.status !== "pending") {
        throw new AppError("Signup request not found", 404, "signup_request_not_found");
      }

      const existingUser = await this.userRepository.findByOrganizationAndEmail(client, input.organizationId, request.email);
      let user;

      if (existingUser) {
        if (existingUser.auth_user_id && existingUser.auth_user_id !== request.auth_user_id) {
          throw new AppError(
            "A different auth account is already linked to this email in the selected organization",
            409,
            "signup_email_already_linked"
          );
        }

        const linkedUser = await this.userRepository.linkGoogleSignup(client, existingUser.id, {
          authUserId: request.auth_user_id,
          fullName: input.fullName ?? request.full_name,
          avatarUrl: request.avatar_url,
          role: input.role
        });

        if (!linkedUser) {
          throw new AppError("User not found", 404, "user_not_found");
        }

        user = linkedUser;
      } else {
        user = await this.userRepository.createFromGoogleSignup(client, {
          organizationId: input.organizationId,
          authUserId: request.auth_user_id,
          email: request.email,
          fullName: input.fullName ?? request.full_name,
          avatarUrl: request.avatar_url,
          role: input.role
        });
      }

      const approvedRequest = await this.googleSignupRequestRepository.approve(client, {
        requestId,
        reviewedByAuthUserId: authUser.authUserId,
        organizationId: input.organizationId,
        organizationUserId: user.id
      });

      if (!approvedRequest) {
        throw new AppError("Signup request not found", 404, "signup_request_not_found");
      }

      return {
        request: approvedRequest,
        user
      };
    });
  }

  async rejectGoogleSignupRequest(authUser: AuthUser, requestId: string, reason: string | null) {
    if (authUser.role !== "super_admin") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    return withTransaction(async (client) => {
      const rejectedRequest = await this.googleSignupRequestRepository.reject(client, {
        requestId,
        reviewedByAuthUserId: authUser.authUserId,
        reason
      });

      if (!rejectedRequest) {
        throw new AppError("Signup request not found", 404, "signup_request_not_found");
      }

      return rejectedRequest;
    });
  }

  async updateUser(
    authUser: AuthUser,
    userId: string,
    input: {
      organizationId?: string | null;
      fullName: string | null;
      avatarUrl?: string | null;
      role: Exclude<UserRole, "super_admin">;
      status: "invited" | "active" | "disabled";
    }
  ) {
    return withTransaction(async (client) => {
      const existingUser = await this.userRepository.findById(client, userId);

      if (!existingUser) {
        throw new AppError("User not found", 404, "user_not_found");
      }

      if (authUser.role !== "super_admin" && existingUser.organization_id !== authUser.organizationId) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      if (existingUser.auth_user_id && existingUser.auth_user_id === authUser.authUserId && input.status !== "active") {
        throw new AppError("You cannot disable your own user", 400, "cannot_disable_self");
      }

      const resolvedOrganizationId = authUser.role === "super_admin"
        ? input.organizationId ?? existingUser.organization_id
        : existingUser.organization_id;

      if (!resolvedOrganizationId) {
        throw new AppError("organization_id is required", 400, "organization_required");
      }

      const updatedUser = await this.userRepository.updateById(client, userId, {
        organizationId: resolvedOrganizationId,
        fullName: input.fullName,
        avatarUrl: input.avatarUrl === undefined ? existingUser.avatar_url : input.avatarUrl,
        role: input.role,
        status: input.status
      });

      if (!updatedUser) {
        throw new AppError("User not found", 404, "user_not_found");
      }

      return updatedUser;
    });
  }

  async resetUserPassword(authUser: AuthUser, userId: string, password: string) {
    const existingUser = await withTransaction(async (client) => {
      const user = await this.userRepository.findById(client, userId);

      if (!user || user.status === "disabled") {
        throw new AppError("User not found", 404, "user_not_found");
      }

      if (!user.auth_user_id) {
        throw new AppError("User does not have an auth account", 400, "auth_user_missing");
      }

      if (user.auth_user_id === authUser.authUserId) {
        throw new AppError("Use the current user password reset action for your own account", 400, "use_self_password_reset");
      }

      if (authUser.role === "super_admin") {
        return user;
      }

      if (authUser.role !== "org_admin" || user.organization_id !== authUser.organizationId || user.role === "org_admin") {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return user;
    });

    const targetAuthUserId = existingUser.auth_user_id;

    if (!targetAuthUserId) {
      throw new AppError("User does not have an auth account", 400, "auth_user_missing");
    }

    await this.authService.updatePassword(targetAuthUserId, password);

    return existingUser;
  }

  async deleteUser(authUser: AuthUser, userId: string) {
    const deletedUser = await withTransaction(async (client) => {
      const existingUser = await this.userRepository.findById(client, userId);

      if (!existingUser || existingUser.status === "disabled") {
        throw new Error("User not found");
      }

      if (authUser.role !== "super_admin" && existingUser.organization_id !== authUser.organizationId) {
        throw new Error("Insufficient permissions");
      }

      if (existingUser.auth_user_id && existingUser.auth_user_id === authUser.authUserId) {
        throw new Error("You cannot delete your own user");
      }

      return this.userRepository.deleteById(client, userId);
    });

    if (!deletedUser) {
      throw new Error("User not found");
    }

    if (deletedUser.auth_user_id) {
      try {
        await this.authService.deleteAuthUser(deletedUser.auth_user_id);
      } catch (error) {
        logger.warn(
          { error, authUserId: deletedUser.auth_user_id, userId: deletedUser.id },
          "Organization user deleted but Supabase auth cleanup failed"
        );
      }
    }

    return deletedUser;
  }

  async listWhatsAppAccounts(authUser: AuthUser, organizationId?: string) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? organizationId : authUser.organizationId;

    const client = await pool.connect();
    try {
      if (authUser.role === "super_admin" && !resolvedOrganizationId) {
        const accounts = await this.whatsappRepository.listAll(client);
        return await this.attachLiveStatus(accounts);
      }

      if (!resolvedOrganizationId) {
        throw new Error("organization_id is required");
      }

      if (!canManageOrganizationWhatsAppAccounts(authUser)) {
        if (!authUser.organizationUserId) {
          throw new AppError("Organization user context is required", 403, "organization_user_required");
        }

        const accounts = await this.whatsappRepository.listByOrganizationAndCreator(
          client,
          resolvedOrganizationId,
          authUser.organizationUserId
        );

        return await this.attachLiveStatus(accounts);
      }

      const accounts = await this.whatsappRepository.listByOrganization(client, resolvedOrganizationId);
      return await this.attachLiveStatus(accounts);
    } finally {
      client.release();
    }
  }

  private async attachLiveStatus(accounts: import("../types/domain.js").WhatsAppAccountRecord[]) {
    return await Promise.all(
      accounts.map(async (account) => {
        try {
          const liveStatus = await this.connectorClient.getAccountStatus(account.id);

          return {
            ...account,
            live_connection_status: liveStatus.connectionStatus,
            live_connected: liveStatus.connected,
            live_status_error: null
          };
        } catch (error) {
          logger.warn(
            {
              err: error,
              whatsappAccountId: account.id
            },
            "Unable to verify live WhatsApp account status"
          );

          return {
            ...account,
            live_connection_status: null,
            live_connected: null,
            live_status_error: error instanceof Error ? error.message : "Unable to verify live connector status"
          };
        }
      })
    );
  }

  async listWhatsAppAccountAccess(authUser: AuthUser, organizationId?: string | null) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    if (!canManageWhatsAppNumberAccess(authUser, resolvedOrganizationId)) {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    const client = await pool.connect();
    try {
      const accounts = await this.whatsappAccessRepository.listAccountSummaries(client, resolvedOrganizationId);
      const users = await this.userRepository.listByOrganization(client, resolvedOrganizationId);

      return {
        organizationId: resolvedOrganizationId,
        accounts,
        users
      };
    } finally {
      client.release();
    }
  }

  async getWhatsAppAccountAccess(authUser: AuthUser, whatsappAccountId: string) {
    const client = await pool.connect();
    try {
      const account = await this.whatsappRepository.findById(client, whatsappAccountId);

      if (!account) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppNumberAccess(authUser, account.organization_id)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      const accessList = await this.whatsappAccessRepository.listAccessForAccount(client, {
        organizationId: account.organization_id,
        whatsappAccountId
      });
      const users = authUser.role === "super_admin"
        ? await this.userRepository.listAll(client)
        : await this.userRepository.listByOrganization(client, account.organization_id);

      return {
        account,
        accessList,
        users
      };
    } finally {
      client.release();
    }
  }

  async updateWhatsAppAccountAccess(
    authUser: AuthUser,
    whatsappAccountId: string,
    accessList: WhatsAppAccountAccessInput[]
  ) {
    return withTransaction(async (client) => {
      const account = await this.whatsappRepository.findById(client, whatsappAccountId);

      if (!account) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppNumberAccess(authUser, account.organization_id)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      try {
        await this.whatsappAccessRepository.replaceAccessForAccount(client, {
          organizationId: account.organization_id,
          whatsappAccountId,
          accessList,
          allowCrossOrganizationUsers: authUser.role === "super_admin"
        });
      } catch (error) {
        if (error instanceof Error && error.message === "At least one active owner is required") {
          throw new AppError(error.message, 400, "whatsapp_account_owner_required");
        }

        if (error instanceof Error && error.message === "All users must belong to the same organization") {
          throw new AppError(error.message, 400, "whatsapp_account_access_user_scope_invalid");
        }

        if (error instanceof Error && error.message === "All users must exist and be enabled") {
          throw new AppError(error.message, 400, "whatsapp_account_access_user_invalid");
        }

        throw error;
      }

      const updatedAccessList = await this.whatsappAccessRepository.listAccessForAccount(client, {
        organizationId: account.organization_id,
        whatsappAccountId
      });

      return {
        account,
        accessList: updatedAccessList
      };
    });
  }

  async createWhatsAppAccount(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      name: string;
      phoneNumber: string | null;
      historySyncLookbackDays?: number | null;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id is required");
    }

    if (!canManageOrganizationWhatsAppAccounts(authUser) && resolvedOrganizationId !== authUser.organizationId) {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    if (!canManageOrganizationWhatsAppAccounts(authUser) && !authUser.organizationUserId) {
      throw new AppError("Organization user context is required", 403, "organization_user_required");
    }

    const account = await withTransaction(async (client) => {
      const currentAccounts = await this.whatsappRepository.countByOrganization(client, resolvedOrganizationId);
      const maxWhatsappAccounts = await this.getOrganizationLimitValueWithClient(
        client,
        resolvedOrganizationId,
        MAX_WHATSAPP_ACCOUNTS_KEY,
        DEFAULT_MAX_WHATSAPP_ACCOUNTS
      );

      if (currentAccounts >= (maxWhatsappAccounts ?? DEFAULT_MAX_WHATSAPP_ACCOUNTS)) {
        throw new AppError(
          "This organization has reached its WhatsApp connection limit.",
          403,
          "WHATSAPP_ACCOUNT_LIMIT_REACHED"
        );
      }

      const account = await this.whatsappRepository.create(client, {
        organizationId: resolvedOrganizationId,
        name: input.name.trim(),
        phoneNumber: input.phoneNumber,
        createdBy: authUser.organizationUserId,
        historySyncLookbackDays: input.historySyncLookbackDays ?? 7
      });

      if (authUser.organizationUserId) {
        await client.query(
          `
            insert into whatsapp_account_user_access (
              organization_id,
              whatsapp_account_id,
              organization_user_id,
              access_role,
              can_view,
              can_reply,
              can_create_sales,
              can_edit_sales
            )
            values ($1, $2, $3, 'owner', true, true, true, true)
            on conflict (whatsapp_account_id, organization_user_id) do nothing
          `,
          [resolvedOrganizationId, account.id, authUser.organizationUserId]
        );
      }

      return account;
    });

    void this.connectorClient.initializeAccount(account.id).catch((error) => {
      logger.error({ error, accountId: account.id }, "Failed to initialize WhatsApp session after account creation");
    });

    return account;
  }

  async updateWhatsAppAccount(
    authUser: AuthUser,
    accountId: string,
    input: {
      organizationId?: string | null;
      name: string;
      phoneNumber: string | null;
      historySyncLookbackDays?: number | null;
    }
  ) {
    return withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      const resolvedOrganizationId = authUser.role === "super_admin"
        ? input.organizationId ?? existingAccount.organization_id
        : authUser.role === "org_admin"
          ? input.organizationId ?? existingAccount.organization_id
          : existingAccount.organization_id;

      if (!resolvedOrganizationId) {
        throw new AppError("organization_id is required", 400, "organization_required");
      }

      if (authUser.role === "org_admin" && resolvedOrganizationId !== authUser.organizationId) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      const updatedAccount = await this.whatsappRepository.update(client, accountId, {
        organizationId: resolvedOrganizationId,
        name: input.name.trim(),
        phoneNumber: input.phoneNumber,
        historySyncLookbackDays: input.historySyncLookbackDays ?? existingAccount.history_sync_lookback_days ?? 7
      });

      if (!updatedAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      return updatedAccount;
    });
  }

  async reconnectWhatsAppAccount(authUser: AuthUser, accountId: string) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return existingAccount;
    });

    try {
      await this.connectorClient.reconnectAccount(account.id);
    } catch (error) {
      logger.warn(
        { error, accountId: account.id },
        "Failed to reconnect WhatsApp account through connector"
      );
      throw new AppError(
        "WhatsApp connector is unavailable or failed to start the reconnect flow",
        502,
        "connector_unavailable"
      );
    }

    return account;
  }

  async resetWhatsAppAccountPairing(authUser: AuthUser, accountId: string) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return existingAccount;
    });

    try {
      await this.connectorClient.terminateAccount(account.id);
      await this.connectorClient.reconnectAccount(account.id);
    } catch (error) {
      logger.warn(
        { error, accountId: account.id },
        "Failed to reset WhatsApp account pairing through connector"
      );
      throw new AppError(
        "WhatsApp connector is unavailable or failed to reset the pairing flow",
        502,
        "connector_unavailable"
      );
    }

    return withTransaction(async (client) => {
      return (await this.whatsappRepository.findById(client, accountId)) ?? account;
    });
  }

  async disconnectWhatsAppAccount(authUser: AuthUser, accountId: string) {
    const existingAccount = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return existingAccount;
    });

    try {
      await this.connectorClient.terminateAccount(existingAccount.id);
    } catch (error) {
      logger.warn(
        { error, accountId: existingAccount.id },
        "Failed to disconnect WhatsApp account through connector"
      );
      throw new AppError(
        "WhatsApp connector is unavailable or failed to terminate the session",
        502,
        "connector_unavailable"
      );
    }

    return withTransaction(async (client) => {
      const account = await this.whatsappRepository.updateConnectionStatus(client, accountId, "disconnected");

      if (!account) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      return account;
    });
  }

  async getWhatsAppAccountQr(authUser: AuthUser, accountId: string) {
    const client = await pool.connect();
    try {
      const account = await this.whatsappRepository.findById(client, accountId);

      if (!account) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, account)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      if (account.connection_status !== "qr_required") {
        return null;
      }

      return this.whatsappRepository.findLatestQrByAccountId(client, accountId);
    } finally {
      client.release();
    }
  }

  async deleteWhatsAppAccount(authUser: AuthUser, accountId: string) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return this.whatsappRepository.deleteById(client, accountId);
    });

    if (!account) {
      throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
    }

    void this.connectorClient.terminateAccount(account.id).catch((error) => {
      logger.warn(
        { error, accountId: account.id },
        "WhatsApp account deleted but connector session cleanup failed"
      );
    });

    return account;
  }

  async listRawEvents(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      whatsappAccountId?: string | null;
      statuses?: Array<"pending" | "processing" | "processed" | "failed" | "ignored">;
      limit?: number;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    const client = await pool.connect();
    try {
      return this.rawEventRepository.list(client, {
        organizationId: resolvedOrganizationId,
        whatsappAccountId: input.whatsappAccountId ?? null,
        statuses: input.statuses,
        limit: input.limit
      });
    } finally {
      client.release();
    }
  }

  async replayRawEvents(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      whatsappAccountId?: string | null;
      eventIds?: string[];
      statuses?: Array<"failed" | "ignored" | "pending" | "processing" | "processed">;
      limit?: number;
      processNow?: boolean;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId && !input.eventIds?.length) {
      throw new Error("organization_id is required");
    }

    let replayEventIds: string[] = [];

    const replayed = await withTransaction(async (client) => {
      if (input.eventIds && input.eventIds.length > 0) {
        const ownedEvents = await this.rawEventRepository.list(client, {
          organizationId: resolvedOrganizationId,
          limit: input.eventIds.length * 2
        });

        const allowedIds = new Set(ownedEvents.map((event) => event.id));
        const filteredIds = input.eventIds.filter((eventId) => allowedIds.has(eventId));
        replayEventIds = filteredIds;

        if (filteredIds.length === 0) {
          return 0;
        }

        return this.rawEventRepository.requeueByIds(client, filteredIds);
      }

      const candidates = await this.rawEventRepository.list(client, {
        organizationId: resolvedOrganizationId,
        whatsappAccountId: input.whatsappAccountId ?? null,
        statuses: input.statuses ?? ["failed"],
        limit: input.limit ?? 100
      });

      replayEventIds = candidates.map((event) => event.id);

      if (replayEventIds.length === 0) {
        return 0;
      }

      return this.rawEventRepository.requeueByIds(client, replayEventIds);
    });

    let processed = 0;

    if (input.processNow && replayed > 0) {
      for (const eventId of replayEventIds) {
        const didProcess = await this.rawEventProcessorService.processEventById(eventId);
        processed += didProcess ? 1 : 0;
      }
    }

    return {
      replayed,
      processed
    };
  }
}
