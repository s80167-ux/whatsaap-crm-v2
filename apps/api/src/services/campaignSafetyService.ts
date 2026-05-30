import type { PoolClient } from "pg";
import { pool, query, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { AuditLogService } from "./auditLogService.js";

type SafetyStatus = "pass" | "warning" | "blocked";
type SpamRiskLevel = "low" | "medium" | "high" | "critical";

type SafetySettings = {
  organization_id: string;
  whatsapp_daily_limit: number;
  per_account_daily_limit: number;
  send_rate_per_minute: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  auto_pause_enabled: boolean;
  auto_pause_failure_rate: string | number;
  auto_pause_min_sent: number;
  recent_contact_cooldown_hours: number;
  require_opt_out_text: boolean;
  block_high_spam_risk: boolean;
};

type CampaignRow = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  audience_group_id: string | null;
  sender_whatsapp_account_id: string | null;
  message_template: string | null;
  daily_limit: number;
  delay_per_message_seconds: number;
  batch_size: number;
  batch_pause_seconds: number;
  stop_on_high_failure: boolean;
};

const OPT_OUT_KEYWORDS = ["STOP", "UNSUBSCRIBE", "TAK NAK", "TAKNAK", "JANGAN HANTAR", "BERHENTI", "CANCEL"];
const SPAM_PATTERNS = [
  "FREE!!!",
  "LIMITED TIME!!!",
  "GUARANTEED",
  "CLAIM NOW",
  "CLICK NOW",
  "HADIAH PERCUMA",
  "MENANG",
  "SEGERA",
  "TERHAD",
  "TAK PERLU BAYAR",
  "CONFIRM LULUS"
];

function canManage(user: AuthUser) {
  return user.role === "super_admin" || user.role === "org_admin" || user.permissionKeys.includes("org.manage_settings");
}

function resolveOrganizationId(user: AuthUser, organizationId?: string | null) {
  if (user.role === "super_admin") {
    const resolved = organizationId ?? user.organizationId;
    if (!resolved) throw new AppError("organization_id is required", 400, "organization_required");
    return resolved;
  }

  if (!user.organizationId) throw new AppError("organization_id is required", 400, "organization_required");
  if (organizationId && organizationId !== user.organizationId) {
    throw new AppError("Organization scope mismatch", 403, "organization_scope_mismatch");
  }
  return user.organizationId;
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export class CampaignSafetyService {
  constructor(private readonly auditLogService = new AuditLogService()) {}

  static async ensureTables(client: PoolClient) {
    await client.query(`
      create table if not exists campaign_safety_settings (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade unique,
        whatsapp_daily_limit integer not null default 500,
        per_account_daily_limit integer not null default 300,
        send_rate_per_minute integer not null default 10,
        min_delay_seconds integer not null default 5,
        max_delay_seconds integer not null default 20,
        auto_pause_enabled boolean not null default true,
        auto_pause_failure_rate numeric not null default 0.25,
        auto_pause_min_sent integer not null default 20,
        recent_contact_cooldown_hours integer not null default 0,
        require_opt_out_text boolean not null default true,
        block_high_spam_risk boolean not null default false,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query(`
      create table if not exists contact_communication_preferences (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        contact_id uuid null references contacts(id) on delete set null,
        normalized_phone text not null,
        channel text not null default 'whatsapp',
        status text not null,
        reason text null,
        source text null,
        created_by_user_id uuid null references organization_users(id) on delete set null,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now()),
        unique (organization_id, channel, normalized_phone)
      )
    `);
    await client.query(`
      create table if not exists campaign_safety_overrides (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        campaign_id uuid not null references campaigns(id) on delete cascade,
        warning_codes jsonb not null default '[]'::jsonb,
        note text null,
        created_by_user_id uuid null references organization_users(id) on delete set null,
        created_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query(`
      alter table campaigns
        add column if not exists safety_status text null,
        add column if not exists safety_score integer null,
        add column if not exists safety_checked_at timestamptz null,
        add column if not exists safety_summary jsonb null,
        add column if not exists pause_reason text null
    `);
    await client.query(`
      alter table campaign_recipients
        add column if not exists validation_status text not null default 'valid',
        add column if not exists validation_reason text null,
        add column if not exists normalized_phone text null,
        add column if not exists excluded_at timestamptz null,
        add column if not exists excluded_reason text null,
        add column if not exists failure_code text null,
        add column if not exists failure_reason text null,
        add column if not exists last_attempt_at timestamptz null,
        add column if not exists safety_exclusion_reason text null
    `);
  }

  static checkContentRisk(input: { message: string; channel?: string; variables?: string[] }) {
    const message = input.message ?? "";
    const upper = message.toUpperCase();
    const warnings: string[] = [];
    const suggestions: string[] = [];
    const detectedPatterns: string[] = [];
    let score = 0;

    const linkCount = (message.match(/https?:\/\/|www\./gi) ?? []).length;
    const exclamationCount = (message.match(/!/g) ?? []).length;
    const emojiCount = (message.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? []).length;
    const uppercaseLetters = message.replace(/[^A-Z]/g, "").length;
    const letters = message.replace(/[^a-zA-Z]/g, "").length;
    const allCapsRatio = letters > 0 ? uppercaseLetters / letters : 0;
    const hasOptOutText = /(stop|unsubscribe|tak nak|taknak|berhenti|jangan hantar|cancel)/i.test(message);

    if (linkCount > 2) {
      score += 20;
      warnings.push("Message contains too many links.");
      suggestions.push("Keep WhatsApp campaign messages to one trusted link when possible.");
    } else if (linkCount > 0) {
      score += 5;
    }

    if (exclamationCount >= 4) {
      score += 15;
      warnings.push("Message uses excessive exclamation marks.");
    }

    if (emojiCount > 8) {
      score += 10;
      warnings.push("Message uses many emoji characters.");
    }

    if (letters >= 30 && allCapsRatio > 0.45) {
      score += 15;
      warnings.push("Message has high all-caps usage.");
    }

    if (message.length > 1200) {
      score += 10;
      warnings.push("Message is very long for WhatsApp.");
    }

    for (const pattern of SPAM_PATTERNS) {
      if (upper.includes(pattern)) {
        detectedPatterns.push(pattern);
        score += 10;
      }
    }

    if (detectedPatterns.length > 0) {
      warnings.push("Message contains phrases that can look spammy.");
      suggestions.push("Use specific, truthful wording and avoid exaggerated urgency.");
    }

    const repeatedWord = message.toLowerCase().match(/\b([a-z0-9]{4,})\b(?:\s+\1\b){2,}/);
    if (repeatedWord) {
      score += 10;
      warnings.push("Message repeats the same word multiple times.");
    }

    if (!hasOptOutText) {
      score += 15;
      warnings.push("Message is missing clear opt-out text.");
      suggestions.push("Add a short opt-out line such as 'Reply STOP to opt out'.");
    }

    score = Math.max(0, Math.min(100, score));
    const level: SpamRiskLevel = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";

    return {
      spam_risk_score: score,
      spam_risk_level: level,
      warnings,
      suggestions,
      detected_patterns: detectedPatterns,
      detected_risk_keywords: detectedPatterns,
      message_length: message.length,
      link_count: linkCount,
      has_opt_out_text: hasOptOutText,
      variable_errors: findVariableErrors(message),
      spintax_errors: findSpintaxErrors(message)
    };
  }

  async getSettings(user: AuthUser, input?: { organizationId?: string | null }) {
    const organizationId = resolveOrganizationId(user, input?.organizationId);
    return withClient(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      return getSettingsOnClient(client, organizationId);
    });
  }

  async updateSettings(user: AuthUser, input: Partial<SafetySettings> & { organizationId?: string | null }) {
    if (!canManage(user)) throw new AppError("Insufficient permissions", 403, "campaign_safety_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const settings = await withTransaction(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      const result = await client.query(
        `
          insert into campaign_safety_settings (
            organization_id, whatsapp_daily_limit, per_account_daily_limit, send_rate_per_minute,
            min_delay_seconds, max_delay_seconds, auto_pause_enabled, auto_pause_failure_rate,
            auto_pause_min_sent, recent_contact_cooldown_hours, require_opt_out_text, block_high_spam_risk
          ) values ($1, coalesce($2, 500), coalesce($3, 300), coalesce($4, 10), coalesce($5, 5), coalesce($6, 20),
            coalesce($7, true), coalesce($8, 0.25), coalesce($9, 20), coalesce($10, 0), coalesce($11, true), coalesce($12, false))
          on conflict (organization_id)
          do update set
            whatsapp_daily_limit = coalesce($2, campaign_safety_settings.whatsapp_daily_limit),
            per_account_daily_limit = coalesce($3, campaign_safety_settings.per_account_daily_limit),
            send_rate_per_minute = coalesce($4, campaign_safety_settings.send_rate_per_minute),
            min_delay_seconds = coalesce($5, campaign_safety_settings.min_delay_seconds),
            max_delay_seconds = coalesce($6, campaign_safety_settings.max_delay_seconds),
            auto_pause_enabled = coalesce($7, campaign_safety_settings.auto_pause_enabled),
            auto_pause_failure_rate = coalesce($8, campaign_safety_settings.auto_pause_failure_rate),
            auto_pause_min_sent = coalesce($9, campaign_safety_settings.auto_pause_min_sent),
            recent_contact_cooldown_hours = coalesce($10, campaign_safety_settings.recent_contact_cooldown_hours),
            require_opt_out_text = coalesce($11, campaign_safety_settings.require_opt_out_text),
            block_high_spam_risk = coalesce($12, campaign_safety_settings.block_high_spam_risk),
            updated_at = timezone('utc', now())
          returning *
        `,
        [
          organizationId,
          input.whatsapp_daily_limit ?? null,
          input.per_account_daily_limit ?? null,
          input.send_rate_per_minute ?? null,
          input.min_delay_seconds ?? null,
          input.max_delay_seconds ?? null,
          input.auto_pause_enabled ?? null,
          input.auto_pause_failure_rate ?? null,
          input.auto_pause_min_sent ?? null,
          input.recent_contact_cooldown_hours ?? null,
          input.require_opt_out_text ?? null,
          input.block_high_spam_risk ?? null
        ]
      );
      return result.rows[0];
    });
    await this.auditLogService.record(user, {
      organizationId,
      action: "campaign.safety_settings_updated",
      entityType: "campaign_safety_settings",
      entityId: organizationId,
      metadata: settings
    });
    return settings;
  }

  async runCampaignPrecheck(user: AuthUser | null, input: { organizationId?: string | null; campaignId: string; audit?: boolean }) {
    const organizationId = user ? resolveOrganizationId(user, input.organizationId) : input.organizationId;
    if (!organizationId) throw new AppError("organization_id is required", 400, "organization_required");

    const result = await withClient(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      const settings = await getSettingsOnClient(client, organizationId);
      const campaign = await getCampaignOnClient(client, organizationId, input.campaignId);
      const recipientSummary = await getRecipientSummary(client, campaign, settings);
      const contentSummary = CampaignSafetyService.checkContentRisk({ message: campaign.message_template ?? "" });
      const sendingSummary = await getSendingSummary(client, campaign, settings);
      const bannedSenders = await getBannedSenderCount(client, campaign);
      const blockingErrors: string[] = [];
      const warnings: string[] = [];

      if (recipientSummary.valid <= 0) blockingErrors.push("no_valid_recipients");
      if (bannedSenders.all_banned) blockingErrors.push("whatsapp_account_banned");
      else if (!sendingSummary.selected_whatsapp_account_id || !["connected", "open", "ready"].includes(String(sendingSummary.account_status))) {
        blockingErrors.push("whatsapp_account_disconnected");
      } else if (bannedSenders.banned_count > 0) {
        warnings.push("some_senders_banned");
      }
      if (sendingSummary.remaining_today <= 0) blockingErrors.push("daily_limit_reached");
      if (contentSummary.variable_errors.length > 0) blockingErrors.push("required_variables_missing");
      if (contentSummary.spintax_errors.length > 0) blockingErrors.push("spintax_syntax_error");
      if (settings.require_opt_out_text && !contentSummary.has_opt_out_text) warnings.push("missing_opt_out_text");
      if (recipientSummary.duplicate > 0) warnings.push("duplicate_recipients");
      if (recipientSummary.opted_out > 0) warnings.push("opted_out_recipients");
      if (contentSummary.spam_risk_level === "high" || contentSummary.spam_risk_level === "critical") warnings.push("high_spam_risk");
      if (settings.block_high_spam_risk && contentSummary.spam_risk_level === "critical") blockingErrors.push("critical_spam_risk");

      const safetyScore = calculateSafetyScore(blockingErrors, warnings, contentSummary.spam_risk_score, recipientSummary);
      const safetyStatus: SafetyStatus = blockingErrors.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "pass";
      const precheck = {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        organization_id: organizationId,
        safety_status: safetyStatus,
        safety_score: safetyScore,
        can_start: blockingErrors.length === 0,
        blocking_errors: blockingErrors,
        warnings,
        recipient_summary: recipientSummary,
        content_summary: contentSummary,
        sending_summary: sendingSummary
      };

      await client.query(
        `
          update campaigns
          set safety_status = $3,
              safety_score = $4,
              safety_checked_at = timezone('utc', now()),
              safety_summary = $5::jsonb
          where organization_id = $1
            and id = $2
        `,
        [organizationId, campaign.id, safetyStatus, safetyScore, JSON.stringify(precheck)]
      );

      return precheck;
    });

    if (input.audit !== false && user) {
      await this.auditLogService.record(user, {
        organizationId,
        action: "campaign.precheck_ran",
        entityType: "campaign",
        entityId: input.campaignId,
        metadata: {
          safety_score: result.safety_score,
          blocking_errors: result.blocking_errors,
          warnings: result.warnings,
          recipient_summary: result.recipient_summary
        }
      });
    }

    return result;
  }

  async validateCampaignRecipients(user: AuthUser | null, input: { organizationId?: string | null; campaignId: string; audit?: boolean }) {
    const organizationId = user ? resolveOrganizationId(user, input.organizationId) : input.organizationId;
    if (!organizationId) throw new AppError("organization_id is required", 400, "organization_required");
    const summary = await CampaignSafetyService.applyRecipientExclusions(organizationId, input.campaignId);
    if (input.audit !== false && user) {
      await this.auditLogService.record(user, {
        organizationId,
        action: "campaign.recipients_validated",
        entityType: "campaign",
        entityId: input.campaignId,
        metadata: summary
      });
    }
    return summary;
  }

  static async applyRecipientExclusions(organizationId: string, campaignId: string) {
    return withTransaction(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      await client.query(
        `
          update campaign_recipients
          set normalized_phone = coalesce(normalized_phone, phone_normalized),
              validation_status = 'valid',
              validation_reason = null,
              safety_exclusion_reason = null
          where organization_id = $1
            and campaign_id = $2
            and send_status = 'pending'
        `,
        [organizationId, campaignId]
      );
      await client.query(
        `
          update campaign_recipients
          set validation_status = 'invalid',
              validation_reason = 'missing_phone',
              send_status = 'skipped',
              excluded_at = timezone('utc', now()),
              excluded_reason = 'missing_phone',
              safety_exclusion_reason = 'missing_phone',
              failure_code = 'missing_phone',
              failure_reason = 'Missing phone number'
          where organization_id = $1
            and campaign_id = $2
            and send_status = 'pending'
            and nullif(trim(coalesce(phone_normalized, normalized_phone, '')), '') is null
        `,
        [organizationId, campaignId]
      );
      await client.query(
        `
          with ranked as (
            select id, row_number() over (partition by coalesce(normalized_phone, phone_normalized) order by created_at asc, id asc) as rn
            from campaign_recipients
            where organization_id = $1
              and campaign_id = $2
              and send_status = 'pending'
          )
          update campaign_recipients cr
          set validation_status = 'excluded',
              validation_reason = 'duplicate_recipient',
              send_status = 'skipped',
              excluded_at = timezone('utc', now()),
              excluded_reason = 'duplicate_recipient',
              safety_exclusion_reason = 'duplicate_recipient',
              failure_code = 'duplicate_recipient',
              failure_reason = 'Duplicate recipient in this campaign'
          from ranked
          where cr.id = ranked.id
            and ranked.rn > 1
        `,
        [organizationId, campaignId]
      );
      await client.query(
        `
          update campaign_recipients cr
          set validation_status = 'excluded',
              validation_reason = 'opted_out',
              send_status = 'skipped',
              excluded_at = timezone('utc', now()),
              excluded_reason = 'opted_out',
              safety_exclusion_reason = 'opted_out',
              failure_code = 'opted_out',
              failure_reason = 'Recipient opted out'
          from contact_communication_preferences ccp
          where cr.organization_id = $1
            and cr.campaign_id = $2
            and cr.send_status = 'pending'
            and ccp.organization_id = cr.organization_id
            and ccp.channel = 'whatsapp'
            and ccp.normalized_phone = coalesce(cr.normalized_phone, cr.phone_normalized)
            and ccp.status in ('opted_out', 'blocked')
        `,
        [organizationId, campaignId]
      );
      const result = await client.query(
        `
          select
            count(*)::int as total,
            count(*) filter (where send_status = 'pending')::int as valid,
            count(*) filter (where failure_code = 'missing_phone')::int as missing_phone,
            count(*) filter (where failure_code = 'invalid_phone')::int as invalid_phone,
            count(*) filter (where failure_code = 'duplicate_recipient')::int as duplicate,
            count(*) filter (where failure_code = 'opted_out')::int as opted_out,
            count(*) filter (where send_status = 'skipped')::int as excluded
          from campaign_recipients
          where organization_id = $1
            and campaign_id = $2
        `,
        [organizationId, campaignId]
      );
      return result.rows[0];
    });
  }

  async assertCampaignCanStart(user: AuthUser, input: { organizationId?: string | null; campaignId: string }) {
    const precheck = await this.runCampaignPrecheck(user, { ...input, audit: false });
    if (precheck.blocking_errors.length > 0) {
      await this.auditLogService.record(user, {
        organizationId: precheck.organization_id,
        action: "campaign.start_blocked_by_safety",
        entityType: "campaign",
        entityId: input.campaignId,
        metadata: precheck
      });
      throw new AppError("Campaign failed safety pre-check.", 400, "campaign_safety_blocked", precheck);
    }
    if (precheck.warnings.length > 0) {
      const hasOverride = await this.hasRecentOverride(precheck.organization_id, input.campaignId, precheck.warnings);
      if (!hasOverride) {
        throw new AppError("Campaign safety warnings require acknowledgement before start.", 409, "campaign_safety_warning_ack_required", precheck);
      }
    }
    return precheck;
  }

  async createWarningOverride(user: AuthUser, input: { organizationId?: string | null; campaignId: string; warningCodes: string[]; note?: string | null }) {
    if (!canManage(user)) throw new AppError("Insufficient permissions", 403, "campaign_safety_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const result = await withTransaction(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      const inserted = await client.query(
        `
          insert into campaign_safety_overrides (organization_id, campaign_id, warning_codes, note, created_by_user_id)
          values ($1, $2, $3::jsonb, nullif(trim($4), ''), $5)
          returning *
        `,
        [organizationId, input.campaignId, JSON.stringify(input.warningCodes), input.note ?? null, user.organizationUserId]
      );
      return inserted.rows[0];
    });
    await this.auditLogService.record(user, {
      organizationId,
      action: "campaign.warning_overridden",
      entityType: "campaign",
      entityId: input.campaignId,
      metadata: result
    });
    return result;
  }

  async listOptOuts(user: AuthUser, input?: { organizationId?: string | null; status?: string | null; search?: string | null; limit?: number }) {
    const organizationId = resolveOrganizationId(user, input?.organizationId);
    return withClient(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      const values: unknown[] = [organizationId];
      const filters = ["organization_id = $1", "channel = 'whatsapp'"];
      if (input?.status) {
        values.push(input.status);
        filters.push(`status = $${values.length}`);
      }
      if (input?.search?.trim()) {
        values.push(`%${input.search.trim()}%`);
        filters.push(`(normalized_phone ilike $${values.length} or reason ilike $${values.length})`);
      }
      values.push(Math.max(1, Math.min(200, input?.limit ?? 100)));
      const result = await client.query(
        `
          select *
          from contact_communication_preferences
          where ${filters.join(" and ")}
          order by updated_at desc, created_at desc
          limit $${values.length}
        `,
        values
      );
      return result.rows;
    });
  }

  async upsertOptOut(user: AuthUser, input: {
    organizationId?: string | null;
    contactId?: string | null;
    phoneNumber: string;
    status: "allowed" | "opted_out" | "blocked";
    reason?: string | null;
    source?: string | null;
  }) {
    if (!canManage(user)) throw new AppError("Insufficient permissions", 403, "campaign_safety_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
    if (!normalizedPhone) throw new AppError("A valid phone number is required", 400, "invalid_phone");
    const result = await withTransaction(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      const updated = await client.query(
        `
          insert into contact_communication_preferences (
            organization_id, contact_id, normalized_phone, channel, status, reason, source, created_by_user_id
          ) values ($1, $2, $3, 'whatsapp', $4, nullif(trim($5), ''), coalesce(nullif(trim($6), ''), 'manual'), $7)
          on conflict (organization_id, channel, normalized_phone)
          do update set
            contact_id = coalesce(excluded.contact_id, contact_communication_preferences.contact_id),
            status = excluded.status,
            reason = excluded.reason,
            source = excluded.source,
            updated_at = timezone('utc', now())
          returning *
        `,
        [organizationId, input.contactId ?? null, normalizedPhone, input.status, input.reason ?? null, input.source ?? "manual", user.organizationUserId]
      );
      return updated.rows[0];
    });
    await this.auditLogService.record(user, {
      organizationId,
      action: result.status === "allowed" ? "campaign.opt_out_updated" : "campaign.opt_out_created",
      entityType: "contact_communication_preference",
      entityId: result.id,
      metadata: result
    });
    return result;
  }

  async hasRecentOverride(organizationId: string, campaignId: string, warningCodes: string[]) {
    const result = await query(
      `
        select id
        from campaign_safety_overrides
        where organization_id = $1
          and campaign_id = $2
          and created_at >= timezone('utc', now()) - interval '24 hours'
          and warning_codes ?| $3::text[]
        limit 1
      `,
      [organizationId, campaignId, warningCodes]
    );
    return Boolean(result.rows[0]);
  }

  static async autoPauseCampaignIfNeeded(organizationId: string, campaignId: string) {
    return withTransaction(async (client) => {
      await CampaignSafetyService.ensureTables(client);
      const settings = await getSettingsOnClient(client, organizationId);
      if (!settings.auto_pause_enabled) return null;
      const counts = await client.query<{ attempted: string; failed: string }>(
        `
          select
            count(*) filter (where send_status in ('sent', 'failed'))::text as attempted,
            count(*) filter (where send_status = 'failed')::text as failed
          from campaign_recipients
          where organization_id = $1
            and campaign_id = $2
        `,
        [organizationId, campaignId]
      );
      const attempted = Number(counts.rows[0]?.attempted ?? 0);
      const failed = Number(counts.rows[0]?.failed ?? 0);
      const threshold = Number(settings.auto_pause_failure_rate);
      if (attempted < settings.auto_pause_min_sent || attempted === 0 || failed / attempted < threshold) {
        return null;
      }
      const result = await client.query(
        `
          update campaigns
          set status = 'paused',
              pause_reason = 'Auto-paused because failure rate exceeded safety threshold',
              updated_at = timezone('utc', now())
          where organization_id = $1
            and id = $2
            and status = 'sending'
          returning *
        `,
        [organizationId, campaignId]
      );
      return result.rows[0] ?? null;
    });
  }
}

async function getSettingsOnClient(client: PoolClient, organizationId: string): Promise<SafetySettings> {
  const result = await client.query(
    `
      insert into campaign_safety_settings (organization_id)
      values ($1)
      on conflict (organization_id) do nothing
      returning *
    `,
    [organizationId]
  );
  if (result.rows[0]) return result.rows[0];
  const existing = await client.query(`select * from campaign_safety_settings where organization_id = $1`, [organizationId]);
  return existing.rows[0];
}

async function getCampaignOnClient(client: PoolClient, organizationId: string, campaignId: string): Promise<CampaignRow> {
  const result = await client.query(`select * from campaigns where organization_id = $1 and id = $2 limit 1`, [organizationId, campaignId]);
  if (!result.rows[0]) throw new AppError("Campaign not found", 404, "campaign_not_found");
  return result.rows[0];
}

async function getRecipientSummary(client: PoolClient, campaign: CampaignRow, _settings: SafetySettings) {
  if (!campaign.audience_group_id) {
    return {
      total: 0,
      valid: 0,
      invalid_phone: 0,
      duplicate: 0,
      opted_out: 0,
      missing_phone: 0,
      already_contacted_recently: 0,
      excluded: 0
    };
  }

  const audience = await client.query(
    `
      select
        coalesce(total_rows, 0)::int as total,
        coalesce(valid_count, 0)::int as imported_valid,
        coalesce(invalid_count, 0)::int as invalid_phone,
        coalesce(duplicate_count, 0)::int as duplicate,
        coalesce(opt_out_count, 0)::int as import_opted_out
      from campaign_audience_groups
      where organization_id = $1
        and id = $2
      limit 1
    `,
    [campaign.organization_id, campaign.audience_group_id]
  );
  const live = await client.query(
    `
      select
        count(*)::int as stored_contacts,
        count(*) filter (where nullif(trim(phone_normalized), '') is null)::int as missing_phone,
        count(*) filter (where ccp.status in ('opted_out', 'blocked'))::int as opted_out_now
      from campaign_audience_contacts cac
      left join contact_communication_preferences ccp
        on ccp.organization_id = cac.organization_id
       and ccp.channel = 'whatsapp'
       and ccp.normalized_phone = cac.phone_normalized
      where cac.organization_id = $1
        and cac.audience_group_id = $2
    `,
    [campaign.organization_id, campaign.audience_group_id]
  );
  const row = audience.rows[0] ?? {};
  const liveRow = live.rows[0] ?? {};
  const optedOut = Number(row.import_opted_out ?? 0) + Number(liveRow.opted_out_now ?? 0);
  const invalid = Number(row.invalid_phone ?? 0);
  const duplicate = Number(row.duplicate ?? 0);
  const missing = Number(liveRow.missing_phone ?? 0);
  const total = Number(row.total ?? liveRow.stored_contacts ?? 0);
  const valid = Math.max(Number(row.imported_valid ?? liveRow.stored_contacts ?? 0) - Number(liveRow.opted_out_now ?? 0), 0);

  return {
    total,
    valid,
    invalid_phone: invalid,
    duplicate,
    opted_out: optedOut,
    missing_phone: missing,
    already_contacted_recently: 0,
    excluded: invalid + duplicate + optedOut + missing
  };
}

async function getSendingSummary(client: PoolClient, campaign: CampaignRow, settings: SafetySettings) {
  const account = campaign.sender_whatsapp_account_id
    ? await client.query(
        `
          select id, lower(coalesce(connection_status, status, 'disconnected')) as account_status
          from whatsapp_accounts
          where organization_id = $1
            and id = $2
          limit 1
        `,
        [campaign.organization_id, campaign.sender_whatsapp_account_id]
      )
    : { rows: [] as Array<{ id: string; account_status: string }> };
  const sentToday = await client.query<{ sent_today: string }>(
    `
      select count(*)::text as sent_today
      from campaign_recipients
      where organization_id = $1
        and assigned_whatsapp_account_id = $2
        and sent_at >= date_trunc('day', timezone('utc', now()))
    `,
    [campaign.organization_id, campaign.sender_whatsapp_account_id]
  );
  const sentTodayCount = Number(sentToday.rows[0]?.sent_today ?? 0);
  const dailyLimit = Math.min(Number(settings.per_account_daily_limit), Number(campaign.daily_limit || settings.per_account_daily_limit));
  const remainingToday = Math.max(dailyLimit - sentTodayCount, 0);
  const estimatedRecipients = await getPendingRecipientEstimate(client, campaign);
  const rateLimitPerMinute = Math.max(Number(settings.send_rate_per_minute), 1);
  const minDelay = Number(settings.min_delay_seconds ?? 5);
  const maxDelay = Number(settings.max_delay_seconds ?? 20);
  const campaignDelay = campaign.delay_per_message_seconds || minDelay;
  const pacingDelayMin = Math.max(minDelay, Math.min(campaignDelay, maxDelay));
  const pacingDelayMax = Math.max(minDelay, maxDelay);
  const avgDelay = (pacingDelayMin + pacingDelayMax) / 2;

  return {
    selected_whatsapp_account_id: campaign.sender_whatsapp_account_id,
    account_status: account.rows[0]?.account_status ?? "missing",
    daily_limit: dailyLimit,
    sent_today: sentTodayCount,
    remaining_today: remainingToday,
    estimated_duration_minutes: Math.ceil((estimatedRecipients * avgDelay) / 60),
    rate_limit_per_minute: rateLimitPerMinute,
    pacing_delay_seconds: avgDelay,
    pacing_delay_min_seconds: pacingDelayMin,
    pacing_delay_max_seconds: pacingDelayMax
  };
}

async function getPendingRecipientEstimate(client: PoolClient, campaign: CampaignRow) {
  if (!campaign.audience_group_id) return 0;
  const result = await client.query(
    `select count(*)::int as count from campaign_audience_contacts where organization_id = $1 and audience_group_id = $2`,
    [campaign.organization_id, campaign.audience_group_id]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function getBannedSenderCount(client: PoolClient, campaign: CampaignRow) {
  const result = await client.query<{ total: string; banned: string }>(
    `
      select
        count(*)::text as total,
        count(*) filter (where wa.connection_status = 'banned')::text as banned
      from campaign_sender_accounts csa
      join whatsapp_accounts wa on wa.id = csa.whatsapp_account_id
      where csa.organization_id = $1
        and csa.campaign_id = $2
        and csa.is_enabled = true
    `,
    [campaign.organization_id, campaign.id]
  );
  const total = Number(result.rows[0]?.total ?? 0);
  const banned = Number(result.rows[0]?.banned ?? 0);
  return {
    total_count: total,
    banned_count: banned,
    all_banned: total > 0 && banned === total
  };
}

function calculateSafetyScore(blockingErrors: string[], warnings: string[], spamScore: number, summary: { total: number; valid: number }) {
  const invalidRatio = summary.total > 0 ? Math.max(summary.total - summary.valid, 0) / summary.total : 1;
  const score = 100 - blockingErrors.length * 25 - warnings.length * 8 - Math.round(spamScore * 0.25) - Math.round(invalidRatio * 20);
  return Math.max(0, Math.min(100, score));
}

function findVariableErrors(message: string) {
  const errors: string[] = [];
  for (const match of message.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) {
    const key = match[1];
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      errors.push(`Invalid variable: ${key}`);
    }
  }
  return errors;
}

function findSpintaxErrors(message: string) {
  const errors: string[] = [];
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    const prev = message[i - 1];
    if (ch === "{" && prev !== "{" && prev !== "\\") {
      depth++;
    } else if (ch === "}" && prev !== "\\") {
      depth--;
      if (depth < 0) {
        errors.push("Unmatched closing brace '}'");
        depth = 0;
      }
    }
  }
  if (depth > 0) {
    errors.push("Unmatched opening brace '{'");
  }
  // Check for empty options like {a||b}
  for (const match of message.matchAll(/\{([^}]*)\}/g)) {
    const inner = match[1] ?? "";
    if (inner.includes("|") && inner.split("|").some((opt) => opt.trim().length === 0)) {
      errors.push("Empty spin option detected");
    }
  }
  return errors;
}
