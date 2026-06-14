import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
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
import { normalizePhoneNumber } from "../utils/phone.js";
import {
  AuthzRepository,
  EDITABLE_ROLE_PERMISSION_KEYS,
  EDITABLE_ROLE_PERMISSION_ROLES,
  type EditableRolePermissionRole,
  type RolePermissionRole
} from "../repositories/authzRepository.js";

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

type WhatsAppNumberWarmerStatus = "not_started" | "active" | "paused" | "completed";
type WhatsAppNumberWarmerContactSource = "known_contacts";
type WhatsAppNumberWarmerMessageSource = "warmup_templates";

type WhatsAppNumberWarmerRecord = {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  warmup_days: number;
  current_day: number;
  daily_target: number;
  today_warmed: number;
  min_delay_minutes: number;
  max_delay_minutes: number;
  active_from: string;
  active_until: string;
  weekend_enabled: boolean;
  contact_source: WhatsAppNumberWarmerContactSource;
  message_source: WhatsAppNumberWarmerMessageSource;
  manual_recipient_numbers?: string[] | null;
  auto_recipient_numbers?: string[] | null;
  status: WhatsAppNumberWarmerStatus;
  started_at?: string | null;
  paused_at?: string | null;
  completed_at?: string | null;
  last_warmed_at?: string | null;
  next_warm_at?: string | null;
  created_at: string;
  updated_at: string;
};

type WhatsAppNumberWarmerLogRecord = {
  id: string;
  warmer_id: string;
  organization_id: string;
  whatsapp_account_id: string;
  level: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type SaveWhatsAppNumberWarmerInput = {
  warmupDays?: number;
  currentDay?: number;
  dailyTarget?: number;
  minDelayMinutes?: number;
  maxDelayMinutes?: number;
  activeFrom?: string;
  activeUntil?: string;
  weekendEnabled?: boolean;
  contactSource?: WhatsAppNumberWarmerContactSource;
  messageSource?: WhatsAppNumberWarmerMessageSource;
  manualRecipientNumbers?: string[];
  status?: WhatsAppNumberWarmerStatus;
};

type RolePermissionsSummary = {
  role: RolePermissionRole;
  permissionKeys: string[];
};

type RolePermissionsDetail = {
  role: RolePermissionRole;
  permissionKeys: string[];
  availablePermissions: string[];
};

type UpdateRolePermissionsResult = {
  role: EditableRolePermissionRole;
  oldPermissionKeys: string[];
  permissionKeys: string[];
  availablePermissions: string[];
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

function resolveOrganizationIdForModuleStatus(authUser: AuthUser, organizationId?: string | null) {
  return authUser.role === "super_admin" ? organizationId ?? null : authUser.organizationId;
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

function normalizeClockTime(value: string) {
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    throw new AppError("Time must use HH:MM format", 400, "invalid_time_format");
  }

  const [hours, minutes] = trimmed.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new AppError("Time must use a valid 24-hour value", 400, "invalid_time_format");
  }

  return `${trimmed}:00`;
}

function computeNextWarmAt(input: {
  status: WhatsAppNumberWarmerStatus;
  activeFrom: string;
  activeUntil: string;
  minDelayMinutes: number;
}) {
  if (input.status !== "active") {
    return null;
  }

  const now = new Date();
  const candidate = new Date(now.getTime() + input.minDelayMinutes * 60 * 1000);
  const [fromHours, fromMinutes] = input.activeFrom.split(":").map(Number);
  const [untilHours, untilMinutes] = input.activeUntil.split(":").map(Number);
  const windowStart = new Date(candidate);
  windowStart.setHours(fromHours, fromMinutes, 0, 0);
  const windowEnd = new Date(candidate);
  windowEnd.setHours(untilHours, untilMinutes, 0, 0);

  if (candidate < windowStart) {
    return windowStart.toISOString();
  }

  if (candidate > windowEnd) {
    const nextDayStart = new Date(windowStart);
    nextDayStart.setDate(nextDayStart.getDate() + 1);
    return nextDayStart.toISOString();
  }

  return candidate.toISOString();
}

export class AdminService {
  constructor(
    private readonly organizationRepository = new OrganizationAdminRepository(),
    private readonly userRepository = new UserAdminRepository(),
    private readonly googleSignupRequestRepository = new GoogleSignupRequestRepository(),
    private readonly whatsappRepository = new WhatsAppAdminRepository(),
    private readonly whatsappAccessRepository = new WhatsAppAccountAccessRepository(),
    private readonly rawEventRepository = new RawEventRepository(),
    private readonly authzRepository = new AuthzRepository(),
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
    const resolvedOrganizationId = resolveOrganizationIdForModuleStatus(authUser, organizationId);

    if (!resolvedOrganizationId) {
      return {
        organizationId: null,
        moduleKey,
        isEnabled: false
      };
    }

    const client = await pool.connect();
    try {
      return this.getOrganizationModuleStatusWithClient(client, resolvedOrganizationId, moduleKey);
    } finally {
      client.release();
    }
  }

  async listRolePermissions(): Promise<{ data: RolePermissionsSummary[]; availablePermissions: string[] }> {
    const client = await pool.connect();

    try {
      const rows = await this.authzRepository.listRolePermissions(client);
      const permissionMap = new Map<RolePermissionRole, string[]>();

      for (const role of ["super_admin", ...EDITABLE_ROLE_PERMISSION_ROLES] as const) {
        permissionMap.set(role, []);
      }

      for (const row of rows) {
        const existing = permissionMap.get(row.role) ?? [];
        existing.push(row.permission_key);
        permissionMap.set(row.role, existing);
      }

      return {
        data: (["super_admin", ...EDITABLE_ROLE_PERMISSION_ROLES] as const).map((role) => ({
          role,
          permissionKeys: Array.from(new Set(permissionMap.get(role) ?? [])).sort()
        })),
        availablePermissions: [...EDITABLE_ROLE_PERMISSION_KEYS]
      };
    } finally {
      client.release();
    }
  }

  async getRolePermissions(role: RolePermissionRole): Promise<RolePermissionsDetail> {
    const client = await pool.connect();

    try {
      const permissionKeys = await this.authzRepository.listRolePermissionKeys(client, role);

      return {
        role,
        permissionKeys: Array.from(new Set(permissionKeys)).sort(),
        availablePermissions: [...EDITABLE_ROLE_PERMISSION_KEYS]
      };
    } finally {
      client.release();
    }
  }

  async updateRolePermissions(
    role: EditableRolePermissionRole,
    permissionKeys: string[]
  ): Promise<UpdateRolePermissionsResult> {
    const normalizedPermissionKeys = Array.from(new Set(permissionKeys)).sort();

    return withTransaction(async (client) => {
      const previousPermissionKeys = await this.authzRepository.listRolePermissionKeys(client, role);
      await this.authzRepository.replaceRolePermissionKeys(client, role, normalizedPermissionKeys);

      return {
        role,
        oldPermissionKeys: Array.from(new Set(previousPermissionKeys)).sort(),
        permissionKeys: normalizedPermissionKeys,
        availablePermissions: [...EDITABLE_ROLE_PERMISSION_KEYS]
      };
    });
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

  private async getOrganizationModuleStatusWithClient(
    client: PoolClient,
    organizationId: string,
    moduleKey: OrganizationModuleKey
  ) {
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
      [organizationId, lookupKeys, moduleKey]
    );

    return {
      organizationId,
      moduleKey,
      isEnabled: result.rows[0]?.is_enabled ?? getMissingModuleDefault(moduleKey)
    };
  }

  private async getOrganizationModuleStatusesWithClient(
    client: PoolClient,
    organizationId: string,
    moduleKeys: readonly OrganizationModuleKey[]
  ) {
    const moduleStatuses = await Promise.all(
      moduleKeys.map(async (moduleKey) => [moduleKey, await this.getOrganizationModuleStatusWithClient(client, organizationId, moduleKey)] as const)
    );

    return new Map(moduleStatuses);
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
      const moduleStatuses = await this.getOrganizationModuleStatusesWithClient(client, organizationId, [
        CAMPAIGN_MODULE_KEY,
        CAMPAIGN_WHATSAPP_MODULE_KEY,
        CAMPAIGN_EMAIL_MODULE_KEY,
        AI_MESSAGE_ASSIST_MODULE_KEY,
        INBOX_MODULE_KEY,
        CRM_MODULE_KEY,
        SALES_MODULE_KEY
      ]);
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
            isEnabled: moduleStatuses.get(CAMPAIGN_MODULE_KEY)?.isEnabled ?? getMissingModuleDefault(CAMPAIGN_MODULE_KEY)
          },
          {
            moduleKey: CAMPAIGN_WHATSAPP_MODULE_KEY,
            isEnabled:
              moduleStatuses.get(CAMPAIGN_WHATSAPP_MODULE_KEY)?.isEnabled ?? getMissingModuleDefault(CAMPAIGN_WHATSAPP_MODULE_KEY)
          },
          {
            moduleKey: CAMPAIGN_EMAIL_MODULE_KEY,
            isEnabled: moduleStatuses.get(CAMPAIGN_EMAIL_MODULE_KEY)?.isEnabled ?? getMissingModuleDefault(CAMPAIGN_EMAIL_MODULE_KEY)
          },
          {
            moduleKey: AI_MESSAGE_ASSIST_MODULE_KEY,
            isEnabled:
              moduleStatuses.get(AI_MESSAGE_ASSIST_MODULE_KEY)?.isEnabled ?? getMissingModuleDefault(AI_MESSAGE_ASSIST_MODULE_KEY)
          },
          {
            moduleKey: INBOX_MODULE_KEY,
            isEnabled: moduleStatuses.get(INBOX_MODULE_KEY)?.isEnabled ?? getMissingModuleDefault(INBOX_MODULE_KEY)
          },
          {
            moduleKey: CRM_MODULE_KEY,
            isEnabled: moduleStatuses.get(CRM_MODULE_KEY)?.isEnabled ?? getMissingModuleDefault(CRM_MODULE_KEY)
          },
          {
            moduleKey: SALES_MODULE_KEY,
            isEnabled: moduleStatuses.get(SALES_MODULE_KEY)?.isEnabled ?? getMissingModuleDefault(SALES_MODULE_KEY)
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
        const accounts = await this.appendWhatsAppWarmerSummary(client, await this.whatsappRepository.listAll(client));
        return await this.attachLiveStatus(accounts);
      }

      if (!resolvedOrganizationId) {
        throw new Error("organization_id is required");
      }

      if (!canManageOrganizationWhatsAppAccounts(authUser)) {
        if (!authUser.organizationUserId) {
          throw new AppError("Organization user context is required", 403, "organization_user_required");
        }

        const accounts = await this.appendWhatsAppWarmerSummary(
          client,
          await this.whatsappRepository.listByOrganizationAndCreator(
          client,
          resolvedOrganizationId,
          authUser.organizationUserId
          )
        );

        return await this.attachLiveStatus(accounts);
      }

      const accounts = await this.appendWhatsAppWarmerSummary(
        client,
        await this.whatsappRepository.listByOrganization(client, resolvedOrganizationId)
      );
      return await this.attachLiveStatus(accounts);
    } finally {
      client.release();
    }
  }

  async getWhatsAppNumberWarmer(authUser: AuthUser, accountId: string) {
    const client = await pool.connect();
    try {
      const account = await this.getManageableWhatsAppAccount(client, authUser, accountId);
      const profile = await this.findWhatsAppNumberWarmer(client, accountId);
      const autoRecipientNumbers = await this.listAutoWarmerRecipientNumbers(client, account.organization_id, account.id);

      return {
        account: (await this.appendWhatsAppWarmerSummary(client, [account]))[0],
        profile: profile ? { ...profile, auto_recipient_numbers: autoRecipientNumbers } : null
      };
    } finally {
      client.release();
    }
  }

  async enableWhatsAppNumberWarmer(authUser: AuthUser, accountId: string) {
    return withTransaction(async (client) => {
      const account = await this.getManageableWhatsAppAccount(client, authUser, accountId);
      const existing = await this.findWhatsAppNumberWarmer(client, accountId);
      const profile = await this.getOrCreateDefaultWhatsAppNumberWarmer(client, account);
      const autoRecipientNumbers = await this.listAutoWarmerRecipientNumbers(client, account.organization_id, account.id);

      if (!existing) {
        await this.insertWhatsAppNumberWarmerLog(client, {
          warmerId: profile.id,
          organizationId: account.organization_id,
          whatsappAccountId: account.id,
          eventType: "enabled",
          message: "Warmer profile enabled with default settings."
        });
      }

      return {
        account: (await this.appendWhatsAppWarmerSummary(client, [account]))[0],
        profile: { ...profile, auto_recipient_numbers: autoRecipientNumbers }
      };
    });
  }

  async saveWhatsAppNumberWarmer(authUser: AuthUser, accountId: string, input: SaveWhatsAppNumberWarmerInput) {
    return withTransaction(async (client) => {
      const account = await this.getManageableWhatsAppAccount(client, authUser, accountId);
      const existing = await this.getOrCreateDefaultWhatsAppNumberWarmer(client, account);

      const minDelayMinutes = input.minDelayMinutes ?? existing.min_delay_minutes;
      const maxDelayMinutes = input.maxDelayMinutes ?? existing.max_delay_minutes;
      if (minDelayMinutes > maxDelayMinutes) {
        throw new AppError("Minimum delay cannot be greater than maximum delay", 400, "invalid_warmer_delay_range");
      }

      const warmupDays = input.warmupDays ?? existing.warmup_days;
      const currentDay = input.currentDay ?? existing.current_day;
      if (currentDay > warmupDays) {
        throw new AppError("Current day cannot be greater than warmup days", 400, "invalid_warmer_day_range");
      }

      const status = input.status ?? existing.status;
      const activeFrom = normalizeClockTime(input.activeFrom ?? existing.active_from);
      const activeUntil = normalizeClockTime(input.activeUntil ?? existing.active_until);
      const manualRecipientNumbers = Array.from(
        new Set(
          (input.manualRecipientNumbers ?? existing.manual_recipient_numbers ?? [])
            .map((value) => normalizePhoneNumber(value))
            .filter((value): value is string => Boolean(value))
        )
      );
      const nextWarmAt = computeNextWarmAt({
        status,
        activeFrom,
        activeUntil,
        minDelayMinutes
      });

      await client.query(
        `
          update whatsapp_number_warmers
          set
            warmup_days = $2,
            current_day = $3,
            daily_target = $4,
            min_delay_minutes = $5,
            max_delay_minutes = $6,
            active_from = $7::time,
            active_until = $8::time,
            weekend_enabled = $9,
            contact_source = $10,
            message_source = $11,
            manual_recipient_numbers = $12::text[],
            status = $13,
            next_warm_at = $14
          where whatsapp_account_id = $1
        `,
        [
          accountId,
          warmupDays,
          currentDay,
          input.dailyTarget ?? existing.daily_target,
          minDelayMinutes,
          maxDelayMinutes,
          activeFrom,
          activeUntil,
          input.weekendEnabled ?? existing.weekend_enabled,
          input.contactSource ?? existing.contact_source,
          input.messageSource ?? existing.message_source,
          manualRecipientNumbers,
          status,
          nextWarmAt
        ]
      );
      await client.query(
        `
          update whatsapp_accounts
          set
            warmup_level = $2,
            warmup_started_at = case
              when $3 = 'active' then coalesce(warmup_started_at, timezone('utc', now()))
              else warmup_started_at
            end
          where id = $1
        `,
        [accountId, currentDay, status]
      );

      const profile = await this.findWhatsAppNumberWarmer(client, accountId);
      if (!profile) {
        throw new AppError("WhatsApp warmer profile not found", 404, "whatsapp_warmer_not_found");
      }
      const autoRecipientNumbers = await this.listAutoWarmerRecipientNumbers(client, account.organization_id, account.id);

      await this.insertWhatsAppNumberWarmerLog(client, {
        warmerId: profile.id,
        organizationId: account.organization_id,
        whatsappAccountId: account.id,
        eventType: "settings_saved",
        message: "Warmer settings updated.",
        metadata: {
          status: profile.status,
          currentDay: profile.current_day,
          warmupDays: profile.warmup_days,
          dailyTarget: profile.daily_target,
          manualRecipientNumbers
        }
      });

      return {
        account: (await this.appendWhatsAppWarmerSummary(client, [account]))[0],
        profile: { ...profile, auto_recipient_numbers: autoRecipientNumbers }
      };
    });
  }

  async startWhatsAppNumberWarmer(authUser: AuthUser, accountId: string) {
    return withTransaction(async (client) => {
      const account = await this.getManageableWhatsAppAccount(client, authUser, accountId);
      const existing = await this.getOrCreateDefaultWhatsAppNumberWarmer(client, account);
      const nextWarmAt = computeNextWarmAt({
        status: "active",
        activeFrom: existing.active_from,
        activeUntil: existing.active_until,
        minDelayMinutes: existing.min_delay_minutes
      });

      await client.query(
        `
          update whatsapp_number_warmers
          set
            status = 'active',
            started_at = coalesce(started_at, timezone('utc', now())),
            paused_at = null,
            completed_at = null,
            next_warm_at = $2
          where whatsapp_account_id = $1
        `,
        [accountId, nextWarmAt]
      );
      await client.query(
        `
          update whatsapp_accounts
          set
            warmup_started_at = coalesce(warmup_started_at, timezone('utc', now())),
            warmup_level = greatest(coalesce(warmup_level, 1), $2)
          where id = $1
        `,
        [accountId, existing.current_day]
      );

      const profile = await this.findWhatsAppNumberWarmer(client, accountId);
      if (!profile) {
        throw new AppError("WhatsApp warmer profile not found", 404, "whatsapp_warmer_not_found");
      }
      const autoRecipientNumbers = await this.listAutoWarmerRecipientNumbers(client, account.organization_id, account.id);

      await this.insertWhatsAppNumberWarmerLog(client, {
        warmerId: profile.id,
        organizationId: account.organization_id,
        whatsappAccountId: account.id,
        eventType: "started",
        message: "Warmer started."
      });

      return {
        account: (await this.appendWhatsAppWarmerSummary(client, [account]))[0],
        profile: { ...profile, auto_recipient_numbers: autoRecipientNumbers }
      };
    });
  }

  async pauseWhatsAppNumberWarmer(authUser: AuthUser, accountId: string) {
    return withTransaction(async (client) => {
      const account = await this.getManageableWhatsAppAccount(client, authUser, accountId);
      const existing = await this.getOrCreateDefaultWhatsAppNumberWarmer(client, account);

      await client.query(
        `
          update whatsapp_number_warmers
          set
            status = 'paused',
            paused_at = timezone('utc', now()),
            next_warm_at = null
          where whatsapp_account_id = $1
        `,
        [accountId]
      );

      await client.query(
        `
          update whatsapp_accounts
          set
            warmup_started_at = coalesce(warmup_started_at, $2),
            warmup_level = greatest(coalesce(warmup_level, 1), $3)
          where id = $1
        `,
        [accountId, existing.started_at ?? new Date().toISOString(), existing.current_day]
      );

      const profile = await this.findWhatsAppNumberWarmer(client, accountId);
      if (!profile) {
        throw new AppError("WhatsApp warmer profile not found", 404, "whatsapp_warmer_not_found");
      }
      const autoRecipientNumbers = await this.listAutoWarmerRecipientNumbers(client, account.organization_id, account.id);

      await this.insertWhatsAppNumberWarmerLog(client, {
        warmerId: profile.id,
        organizationId: account.organization_id,
        whatsappAccountId: account.id,
        eventType: "paused",
        message: "Warmer paused."
      });

      return {
        account: (await this.appendWhatsAppWarmerSummary(client, [account]))[0],
        profile: { ...profile, auto_recipient_numbers: autoRecipientNumbers }
      };
    });
  }

  async resumeWhatsAppNumberWarmer(authUser: AuthUser, accountId: string) {
    return withTransaction(async (client) => {
      const account = await this.getManageableWhatsAppAccount(client, authUser, accountId);
      const existing = await this.getOrCreateDefaultWhatsAppNumberWarmer(client, account);
      const nextWarmAt = computeNextWarmAt({
        status: "active",
        activeFrom: existing.active_from,
        activeUntil: existing.active_until,
        minDelayMinutes: existing.min_delay_minutes
      });

      await client.query(
        `
          update whatsapp_number_warmers
          set
            status = 'active',
            paused_at = null,
            next_warm_at = $2,
            started_at = coalesce(started_at, timezone('utc', now()))
          where whatsapp_account_id = $1
        `,
        [accountId, nextWarmAt]
      );
      await client.query(
        `
          update whatsapp_accounts
          set
            warmup_started_at = coalesce(warmup_started_at, timezone('utc', now())),
            warmup_level = greatest(coalesce(warmup_level, 1), $2)
          where id = $1
        `,
        [accountId, existing.current_day]
      );

      const profile = await this.findWhatsAppNumberWarmer(client, accountId);
      if (!profile) {
        throw new AppError("WhatsApp warmer profile not found", 404, "whatsapp_warmer_not_found");
      }
      const autoRecipientNumbers = await this.listAutoWarmerRecipientNumbers(client, account.organization_id, account.id);

      await this.insertWhatsAppNumberWarmerLog(client, {
        warmerId: profile.id,
        organizationId: account.organization_id,
        whatsappAccountId: account.id,
        eventType: "resumed",
        message: "Warmer resumed."
      });

      return {
        account: (await this.appendWhatsAppWarmerSummary(client, [account]))[0],
        profile: { ...profile, auto_recipient_numbers: autoRecipientNumbers }
      };
    });
  }

  async listWhatsAppNumberWarmerLogs(authUser: AuthUser, accountId: string) {
    const client = await pool.connect();
    try {
      await this.getManageableWhatsAppAccount(client, authUser, accountId);
      await this.ensureWhatsAppWarmerTables(client);
      const result = await client.query<WhatsAppNumberWarmerLogRecord>(
        `
          select
            id,
            warmer_id,
            organization_id,
            whatsapp_account_id,
            level,
            event_type,
            message,
            metadata,
            created_at
          from whatsapp_number_warmer_logs
          where whatsapp_account_id = $1
          order by created_at desc
          limit 20
        `,
        [accountId]
      );
      return result.rows;
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

  private async ensureWhatsAppWarmerTables(client: PoolClient) {
    await client.query(`
      alter table if exists whatsapp_accounts
      add column if not exists warmup_started_at timestamptz null,
      add column if not exists warmup_level integer null
    `);
    await client.query(`
      create table if not exists whatsapp_number_warmers (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        whatsapp_account_id uuid not null unique references whatsapp_accounts(id) on delete cascade,
        warmup_days integer not null default 14,
        current_day integer not null default 1,
        daily_target integer not null default 10,
        today_warmed integer not null default 0,
        min_delay_minutes integer not null default 5,
        max_delay_minutes integer not null default 20,
        active_from time not null default '09:00',
        active_until time not null default '18:00',
        weekend_enabled boolean not null default false,
        contact_source text not null default 'known_contacts',
        message_source text not null default 'warmup_templates',
        manual_recipient_numbers text[] not null default '{}'::text[],
        status text not null default 'not_started',
        started_at timestamptz null,
        paused_at timestamptz null,
        completed_at timestamptz null,
        last_warmed_at timestamptz null,
        next_warm_at timestamptz null,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query(`
      create table if not exists whatsapp_number_warmer_logs (
        id uuid primary key default gen_random_uuid(),
        warmer_id uuid not null references whatsapp_number_warmers(id) on delete cascade,
        organization_id uuid not null references organizations(id) on delete cascade,
        whatsapp_account_id uuid not null references whatsapp_accounts(id) on delete cascade,
        level text not null default 'info',
        event_type text not null,
        message text not null,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query(`
      create index if not exists whatsapp_number_warmer_logs_account_created_idx
      on whatsapp_number_warmer_logs (whatsapp_account_id, created_at desc)
    `);
    await client.query(`
      alter table whatsapp_number_warmers
      add column if not exists today_warmed integer not null default 0,
      add column if not exists min_delay_minutes integer not null default 5,
      add column if not exists max_delay_minutes integer not null default 20,
      add column if not exists active_from time not null default '09:00',
      add column if not exists active_until time not null default '18:00',
        add column if not exists weekend_enabled boolean not null default false,
        add column if not exists contact_source text not null default 'known_contacts',
        add column if not exists message_source text not null default 'warmup_templates',
        add column if not exists manual_recipient_numbers text[] not null default '{}'::text[],
        add column if not exists status text not null default 'not_started',
      add column if not exists started_at timestamptz null,
      add column if not exists paused_at timestamptz null,
      add column if not exists completed_at timestamptz null,
      add column if not exists last_warmed_at timestamptz null,
      add column if not exists next_warm_at timestamptz null,
      add column if not exists created_at timestamptz not null default timezone('utc', now()),
      add column if not exists updated_at timestamptz not null default timezone('utc', now())
    `);
    await client.query("drop trigger if exists whatsapp_number_warmers_set_updated_at on whatsapp_number_warmers");
    await client.query(`
      create trigger whatsapp_number_warmers_set_updated_at
      before update on whatsapp_number_warmers
      for each row execute function set_updated_at()
    `);
  }

  private async appendWhatsAppWarmerSummary(
    client: PoolClient,
    accounts: import("../types/domain.js").WhatsAppAccountRecord[]
  ) {
    if (accounts.length === 0) {
      return accounts;
    }

    await this.ensureWhatsAppWarmerTables(client);
    const accountIds = accounts.map((account) => account.id);
    const warmerResult = await client.query<{
      whatsapp_account_id: string;
      status: string;
      warmup_days: number;
      current_day: number;
      daily_target: number;
      today_warmed: number;
      last_warmed_at: string | null;
      next_warm_at: string | null;
    }>(
      `
        select
          whatsapp_account_id,
          status,
          warmup_days,
          current_day,
          daily_target,
          today_warmed,
          last_warmed_at,
          next_warm_at
        from whatsapp_number_warmers
        where whatsapp_account_id = any($1::uuid[])
      `,
      [accountIds]
    );
    const warmerByAccountId = new Map(warmerResult.rows.map((row) => [row.whatsapp_account_id, row]));

    return accounts.map((account) => {
      const warmer = warmerByAccountId.get(account.id);
      if (!warmer) {
        return account;
      }

      return {
        ...account,
        warmer_status: warmer.status,
        warmer_warmup_days: warmer.warmup_days,
        warmer_current_day: warmer.current_day,
        warmer_daily_target: warmer.daily_target,
        warmer_today_warmed: warmer.today_warmed,
        warmer_last_warmed_at: warmer.last_warmed_at,
        warmer_next_warm_at: warmer.next_warm_at
      };
    });
  }

  private async listAutoWarmerRecipientNumbers(client: PoolClient, organizationId: string, senderAccountId: string) {
    const result = await client.query<{ phone: string | null }>(
      `
        select coalesce(account_phone_e164, account_phone_normalized) as phone
        from whatsapp_accounts
        where organization_id = $1
          and id <> $2
          and coalesce(account_phone_e164, account_phone_normalized) is not null
          and deleted_at is null
        order by created_at asc
      `,
      [organizationId, senderAccountId]
    );

    const seen = new Set<string>();
    const numbers: string[] = [];

    for (const row of result.rows) {
      const normalized = normalizePhoneNumber(row.phone);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      numbers.push(normalized);
    }

    return numbers;
  }

  private async getManageableWhatsAppAccount(client: PoolClient, authUser: AuthUser, accountId: string) {
    const account = await this.whatsappRepository.findById(client, accountId);

    if (!account) {
      throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
    }

    if (!canManageWhatsAppAccount(authUser, account)) {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    return account;
  }

  private async findWhatsAppNumberWarmer(client: PoolClient, accountId: string) {
    await this.ensureWhatsAppWarmerTables(client);
    const result = await client.query<WhatsAppNumberWarmerRecord>(
      `
        select
          id,
          organization_id,
          whatsapp_account_id,
          warmup_days,
          current_day,
          daily_target,
          today_warmed,
          min_delay_minutes,
          max_delay_minutes,
          to_char(active_from, 'HH24:MI:SS') as active_from,
          to_char(active_until, 'HH24:MI:SS') as active_until,
          weekend_enabled,
          contact_source,
          message_source,
          manual_recipient_numbers,
          status,
          started_at,
          paused_at,
          completed_at,
          last_warmed_at,
          next_warm_at,
          created_at,
          updated_at
        from whatsapp_number_warmers
        where whatsapp_account_id = $1
      `,
      [accountId]
    );

    return result.rows[0] ?? null;
  }

  private async insertWhatsAppNumberWarmerLog(
    client: PoolClient,
    input: {
      warmerId: string;
      organizationId: string;
      whatsappAccountId: string;
      eventType: string;
      message: string;
      level?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    await this.ensureWhatsAppWarmerTables(client);
    await client.query(
      `
        insert into whatsapp_number_warmer_logs (
          id,
          warmer_id,
          organization_id,
          whatsapp_account_id,
          level,
          event_type,
          message,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        randomUUID(),
        input.warmerId,
        input.organizationId,
        input.whatsappAccountId,
        input.level ?? "info",
        input.eventType,
        input.message,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }

  private async getOrCreateDefaultWhatsAppNumberWarmer(
    client: PoolClient,
    account: import("../types/domain.js").WhatsAppAccountRecord
  ) {
    await this.ensureWhatsAppWarmerTables(client);
    await client.query(
      `
        insert into whatsapp_number_warmers (
          organization_id,
          whatsapp_account_id,
          warmup_days,
          current_day,
          daily_target,
          min_delay_minutes,
          max_delay_minutes,
          active_from,
          active_until,
          weekend_enabled,
          contact_source,
          message_source,
          manual_recipient_numbers,
          status
        )
        values ($1, $2, 14, 1, 10, 5, 20, '09:00', '18:00', false, 'known_contacts', 'warmup_templates', '{}'::text[], 'not_started')
        on conflict (whatsapp_account_id) do nothing
      `,
      [account.organization_id, account.id]
    );

    const warmer = await this.findWhatsAppNumberWarmer(client, account.id);
    if (!warmer) {
      throw new AppError("Unable to create WhatsApp warmer profile", 500, "whatsapp_warmer_create_failed");
    }

    return warmer;
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
      const users = await this.userRepository.listByOrganization(client, account.organization_id);

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
          allowCrossOrganizationUsers: false
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

  async reconnectWhatsAppAccount(
    authUser: AuthUser,
    accountId: string,
    options: { confirmBlockedReconnect?: boolean } = {}
  ) {
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

    if (account.connection_status === "suspected_ban" && !options.confirmBlockedReconnect) {
      throw new AppError(
        "Only reconnect after confirming this number works normally in the official WhatsApp app. Reconnecting too early may extend the restriction.",
        409,
        "whatsapp_reconnect_confirmation_required"
      );
    }

    try {
      await this.connectorClient.reconnectAccount(account.id, {
        allowBlockedReconnect: options.confirmBlockedReconnect ?? false
      });
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
