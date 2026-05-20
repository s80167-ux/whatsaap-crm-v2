import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import { isWeakDisplayName, normalizeDisplayName } from "../utils/contactIdentity.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { ContactCommandService } from "./contactCommandService.js";
import { ContactRepairProposalService } from "./contactRepairProposalService.js";
import { AuditLogService } from "./auditLogService.js";

type ConfidenceLevel = "verified" | "strong" | "partial" | "weak" | "broken";

type ContactReliabilityRow = {
  id: string;
  organization_id: string;
  display_name: string | null;
  primary_phone_e164: string | null;
  primary_phone_normalized: string | null;
  company_name: string | null;
  owner_user_id: string | null;
  primary_avatar_url: string | null;
  identity_status: string | null;
  status: string | null;
  merged_into_contact_id: string | null;
  created_at: string;
  updated_at: string | null;
  last_message_at: string | null;
  identity_count: number;
  conversation_count: number;
  inbound_count: number;
  outbound_success_count: number;
  max_identity_score: number;
  has_phone_identity: boolean;
  has_identity_without_phone: boolean;
  has_profile_name: boolean;
  has_avatar: boolean;
  duplicate_phone_count: number;
  duplicate_candidate_count: number;
  conflicting_whatsapp_account_count: number;
  ignored_flags: string[];
};

const MAX_LIMIT = 200;
const GENERIC_ACTION_FLAGS = new Set(["missing_phone", "unknown_name", "jid_without_phone", "avatar_only_no_phone"]);

function clampLimit(value: unknown, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

function clampOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 85) return "verified";
  if (score >= 65) return "strong";
  if (score >= 40) return "partial";
  if (score >= 1) return "weak";
  return "broken";
}

function scoreContact(row: ContactReliabilityRow) {
  let score = 0;
  const reasons: string[] = [];
  const riskFlags = new Set<string>();
  const displayName = normalizeDisplayName(row.display_name);
  const weakName = isWeakDisplayName(displayName);
  const hasPhone = Boolean(row.primary_phone_normalized || row.primary_phone_e164);

  if (hasPhone) {
    score += 30;
    reasons.push("Has a normalized primary phone.");
  } else {
    score -= 25;
    riskFlags.add("missing_phone");
    reasons.push("Primary phone is missing.");
  }

  if (row.has_phone_identity) {
    score += 20;
    reasons.push("Has a usable WhatsApp phone identity.");
  } else if (row.identity_count === 0) {
    riskFlags.add("missing_identity");
    reasons.push("No active contact identity found.");
  }

  if (displayName && !weakName) {
    score += 15;
    reasons.push("Display name looks human-readable.");
  } else {
    score -= 30;
    riskFlags.add("unknown_name");
    reasons.push("Display name is blank or generic.");
  }

  if (row.has_profile_name) {
    score += 10;
    reasons.push("WhatsApp profile name or push name is available.");
  }

  if (row.inbound_count > 0) {
    score += 10;
    reasons.push("Has linked inbound messages.");
  }

  if (row.outbound_success_count > 0) {
    score += 5;
    reasons.push("Has successful outbound messages.");
  }

  if (row.has_avatar) {
    score += 5;
    reasons.push("Has avatar or profile photo.");
  }

  if (row.owner_user_id) {
    score += 5;
    reasons.push("Has an owner assigned.");
  }

  if (row.has_identity_without_phone) {
    score -= 20;
    riskFlags.add("jid_without_phone");
    reasons.push("At least one identity has a JID without a phone.");
  }

  if (row.duplicate_phone_count > 1) {
    score -= 15;
    riskFlags.add("duplicate_phone");
    reasons.push("Another active contact shares this phone.");
  }

  if (row.conflicting_whatsapp_account_count > 1) {
    score -= 10;
    riskFlags.add("identity_conflict");
    reasons.push("Identity appears across multiple WhatsApp accounts.");
  }

  if (row.identity_status === "provisional") {
    score -= 10;
    riskFlags.add("weak_inbound_only");
    reasons.push("Contact is marked provisional from weak inbound data.");
  }

  if (!row.last_message_at) {
    riskFlags.add("no_recent_activity");
  }

  if (row.status === "merged" || row.merged_into_contact_id) {
    riskFlags.add("merged_contact");
  }

  if (row.has_avatar && !hasPhone) {
    riskFlags.add("avatar_only_no_phone");
  }

  const ignored = new Set(row.ignored_flags ?? []);
  const visibleFlags = [...riskFlags].filter((flag) => !ignored.has(flag));
  const finalScore = Math.max(0, Math.min(100, score));

  return {
    confidence_score: finalScore,
    confidence_level: confidenceLevel(finalScore),
    confidence_reasons: reasons,
    risk_flags: visibleFlags
  };
}

function canUseOrganization(user: AuthUser, organizationId: string | null) {
  if (user.role === "super_admin") return true;
  return Boolean(organizationId && user.organizationId === organizationId);
}

function resolveOrganizationId(user: AuthUser, organizationId?: string | null, allowAllForSuperAdmin = false) {
  const resolved = user.role === "super_admin" ? (organizationId ?? null) : user.organizationId;

  if (!resolved && !(allowAllForSuperAdmin && user.role === "super_admin")) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  if (!canUseOrganization(user, resolved)) {
    throw new AppError("Organization is outside your access scope", 403, "organization_forbidden");
  }

  return resolved;
}

async function fetchReliabilityRows(client: PoolClient, input: {
  organizationId: string | null;
  search?: string | null;
  contactId?: string | null;
  contactIds?: string[] | null;
  limit?: number;
  offset?: number;
}) {
  await ensureIgnoredFlagsTable(client);

  const conditions = ["c.deleted_at is null", "coalesce(c.status, 'active') != 'merged'"];
  const values: unknown[] = [];

  if (input.organizationId) {
    values.push(input.organizationId);
    conditions.push(`c.organization_id = $${values.length}`);
  }

  if (input.contactId) {
    values.push(input.contactId);
    conditions.push(`c.id = $${values.length}`);
  }

  if (input.contactIds?.length) {
    values.push(input.contactIds);
    conditions.push(`c.id = any($${values.length}::uuid[])`);
  }

  if (input.search) {
    values.push(`%${input.search.trim()}%`);
    conditions.push(`(
      c.display_name ilike $${values.length}
      or c.primary_phone_normalized ilike $${values.length}
      or c.primary_phone_e164 ilike $${values.length}
      or exists (
        select 1 from contact_identities ci_search
        where ci_search.contact_id = c.id
          and ci_search.deleted_at is null
          and (
            ci_search.wa_jid ilike $${values.length}
            or ci_search.profile_name ilike $${values.length}
            or ci_search.profile_push_name ilike $${values.length}
          )
      )
    )`);
  }

  values.push(input.limit ?? 500);
  const limitIndex = values.length;
  values.push(input.offset ?? 0);
  const offsetIndex = values.length;

  const result = await client.query<ContactReliabilityRow>(
    `
      select
        c.id,
        c.organization_id,
        c.display_name,
        c.primary_phone_e164,
        c.primary_phone_normalized,
        c.company_name,
        c.owner_user_id,
        c.primary_avatar_url,
        c.identity_status,
        c.status,
        c.merged_into_contact_id,
        c.created_at,
        c.updated_at,
        coalesce(msg_stats.last_message_at, c.last_activity_at) as last_message_at,
        coalesce(identity_stats.identity_count, 0)::integer as identity_count,
        coalesce(conversation_stats.conversation_count, 0)::integer as conversation_count,
        coalesce(msg_stats.inbound_count, 0)::integer as inbound_count,
        coalesce(msg_stats.outbound_success_count, 0)::integer as outbound_success_count,
        coalesce(identity_stats.max_identity_score, 0)::integer as max_identity_score,
        coalesce(identity_stats.has_phone_identity, false) as has_phone_identity,
        coalesce(identity_stats.has_identity_without_phone, false) as has_identity_without_phone,
        coalesce(identity_stats.has_profile_name, false) as has_profile_name,
        (nullif(trim(c.primary_avatar_url), '') is not null or coalesce(identity_stats.has_avatar, false)) as has_avatar,
        coalesce(phone_duplicates.duplicate_phone_count, 0)::integer as duplicate_phone_count,
        coalesce(merge_candidate_stats.duplicate_candidate_count, 0)::integer as duplicate_candidate_count,
        coalesce(identity_stats.conflicting_whatsapp_account_count, 0)::integer as conflicting_whatsapp_account_count,
        coalesce(ignored.flags, '{}'::text[]) as ignored_flags
      from contacts c
      left join lateral (
        select
          count(*)::integer as identity_count,
          max(coalesce(ci.identity_score, 0))::integer as max_identity_score,
          bool_or(ci.phone_normalized is not null or ci.wa_jid like '%@s.whatsapp.net' or ci.wa_jid like '%@c.us') as has_phone_identity,
          bool_or(ci.wa_jid is not null and ci.phone_normalized is null) as has_identity_without_phone,
          bool_or(nullif(trim(coalesce(ci.profile_name, ci.profile_push_name)), '') is not null) as has_profile_name,
          bool_or(nullif(trim(ci.profile_avatar_url), '') is not null) as has_avatar,
          count(distinct ci.whatsapp_account_id) filter (where ci.wa_jid is not null)::integer as conflicting_whatsapp_account_count
        from contact_identities ci
        where ci.contact_id = c.id
          and ci.organization_id = c.organization_id
          and ci.deleted_at is null
          and coalesce(ci.is_active, true)
      ) identity_stats on true
      left join lateral (
        select count(*)::integer as duplicate_phone_count
        from contacts c2
        where c2.organization_id = c.organization_id
          and c2.deleted_at is null
          and coalesce(c2.status, 'active') != 'merged'
          and c.primary_phone_normalized is not null
          and c2.primary_phone_normalized = c.primary_phone_normalized
      ) phone_duplicates on true
      left join lateral (
        select count(*)::integer as conversation_count
        from conversations conv
        where conv.organization_id = c.organization_id
          and conv.contact_id = c.id
      ) conversation_stats on true
      left join lateral (
        select
          max(coalesce(m.sent_at, m.created_at)) as last_message_at,
          count(*) filter (where m.direction = 'incoming')::integer as inbound_count,
          count(*) filter (where m.direction = 'outgoing' and coalesce(m.ack_status, '') <> 'failed')::integer as outbound_success_count
        from messages m
        where m.organization_id = c.organization_id
          and m.contact_id = c.id
          and coalesce(m.is_deleted, false) = false
      ) msg_stats on true
      left join lateral (
        select count(*)::integer as duplicate_candidate_count
        from merge_candidates mc
        where mc.organization_id = c.organization_id
          and mc.status = 'pending'
          and (mc.candidate_contact_id_1 = c.id or mc.candidate_contact_id_2 = c.id)
      ) merge_candidate_stats on true
      left join lateral (
        select array_agg(flag order by flag) as flags
        from contact_reliability_ignored_flags crif
        where crif.organization_id = c.organization_id
          and crif.contact_id = c.id
      ) ignored on true
      where ${conditions.join(" and ")}
      order by coalesce(msg_stats.last_message_at, c.last_activity_at, c.updated_at, c.created_at) desc nulls last, c.created_at desc
      limit $${limitIndex}
      offset $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

function toRiskyContact(row: ContactReliabilityRow) {
  return {
    contact_id: row.id,
    display_name: row.display_name,
    primary_phone_e164: row.primary_phone_e164,
    primary_phone_normalized: row.primary_phone_normalized,
    company_name: row.company_name,
    owner_user_id: row.owner_user_id,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    identity_count: row.identity_count,
    conversation_count: row.conversation_count,
    duplicate_candidate_count: row.duplicate_candidate_count,
    ...scoreContact(row)
  };
}

function getBestName(row: any) {
  const candidates = [row.best_profile_name, row.best_push_name, row.display_name]
    .map((value) => normalizeDisplayName(value))
    .filter((value): value is string => Boolean(value) && !isWeakDisplayName(value));
  return candidates[0] ?? null;
}

export class ContactReliabilityService {
  constructor(
    private readonly contactCommandService = new ContactCommandService(),
    private readonly auditLogService = new AuditLogService()
  ) {}

  async getSummary(user: AuthUser, input: { organizationId?: string | null; days?: number }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, true);
    const rows = await withClient((client) => fetchReliabilityRows(client, { organizationId, limit: 10000 }));
    const summary = {
      total_contacts: rows.length,
      verified_count: 0,
      strong_count: 0,
      partial_count: 0,
      weak_count: 0,
      broken_count: 0,
      unknown_name_count: 0,
      missing_phone_count: 0,
      duplicate_phone_count: 0,
      identity_conflict_count: 0,
      risky_contacts_count: 0,
      auto_created_recent_count: 0
    };

    const since = new Date(Date.now() - (input.days ?? 30) * 24 * 60 * 60 * 1000);

    for (const row of rows) {
      const scored = scoreContact(row);
      summary[`${scored.confidence_level}_count` as keyof typeof summary] += 1;
      if (scored.risk_flags.includes("unknown_name")) summary.unknown_name_count += 1;
      if (scored.risk_flags.includes("missing_phone")) summary.missing_phone_count += 1;
      if (scored.risk_flags.includes("duplicate_phone")) summary.duplicate_phone_count += 1;
      if (scored.risk_flags.includes("identity_conflict")) summary.identity_conflict_count += 1;
      if (scored.risk_flags.length > 0 || scored.confidence_level === "weak" || scored.confidence_level === "broken") {
        summary.risky_contacts_count += 1;
      }
      if (row.identity_status === "provisional" && new Date(row.created_at) >= since) {
        summary.auto_created_recent_count += 1;
      }
    }

    return summary;
  }

  async listRiskyContacts(user: AuthUser, input: {
    organizationId?: string | null;
    level?: ConfidenceLevel | null;
    flag?: string | null;
    search?: string | null;
    limit?: number;
    offset?: number;
  }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, true);
    const rows = await withClient((client) =>
      fetchReliabilityRows(client, {
        organizationId,
        search: input.search,
        limit: clampLimit(input.limit),
        offset: clampOffset(input.offset)
      })
    );

    return rows
      .map(toRiskyContact)
      .filter((contact) => !input.level || contact.confidence_level === input.level)
      .filter((contact) => !input.flag || contact.risk_flags.includes(input.flag));
  }

  async listUnknownContacts(user: AuthUser, input: { organizationId?: string | null; limit?: number; offset?: number }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, true);
    const rows = await withClient(async (client) => {
      const reliabilityRows = await fetchReliabilityRows(client, {
        organizationId,
        limit: clampLimit(input.limit),
        offset: clampOffset(input.offset)
      });
      const ids = reliabilityRows.map((row) => row.id);
      if (ids.length === 0) return [];

      const details = await client.query(
        `
          select
            c.id,
            max(ci.profile_name) filter (where nullif(trim(ci.profile_name), '') is not null) as best_profile_name,
            max(ci.profile_push_name) filter (where nullif(trim(ci.profile_push_name), '') is not null) as best_push_name,
            array_remove(array_agg(distinct ci.wa_jid), null) as whatsapp_jids,
            array_remove(array_agg(distinct ci.profile_name), null) as profile_names,
            array_remove(array_agg(distinct ci.profile_push_name), null) as push_names,
            array_remove(array_agg(distinct ci.profile_avatar_url), null) as avatar_urls,
            min(coalesce(ci.first_seen_at, ci.created_at)) as first_seen_at,
            max(coalesce(ci.last_seen_at, ci.updated_at, ci.created_at)) as last_seen_at
          from contacts c
          left join contact_identities ci on ci.contact_id = c.id
            and ci.organization_id = c.organization_id
            and ci.deleted_at is null
            and coalesce(ci.is_active, true)
          where c.id = any($1::uuid[])
          group by c.id
        `,
        [ids]
      );

      const detailsById = new Map(details.rows.map((row) => [row.id, row]));
      return reliabilityRows.map((row) => ({ ...row, ...(detailsById.get(row.id) ?? {}) }));
    });

    return rows
      .map((row: ContactReliabilityRow & Record<string, any>) => {
        const scored = scoreContact(row);
        const bestName = getBestName(row);
        const suggestedAction = scored.risk_flags.includes("duplicate_phone")
          ? "merge_duplicate"
          : scored.risk_flags.includes("unknown_name") && bestName
            ? "update_name"
            : scored.risk_flags.includes("missing_phone")
              ? "attach_phone"
              : scored.risk_flags.some((flag) => GENERIC_ACTION_FLAGS.has(flag))
                ? "needs_manual_review"
                : "ignore";

        return {
          contact_id: row.id,
          display_name: row.display_name,
          best_available_name: bestName,
          primary_phone_e164: row.primary_phone_e164,
          whatsapp_jids: row.whatsapp_jids ?? [],
          profile_names: row.profile_names ?? [],
          push_names: row.push_names ?? [],
          avatar_urls: row.avatar_urls ?? [],
          first_seen_at: row.first_seen_at ?? row.created_at,
          last_seen_at: row.last_seen_at ?? row.last_message_at,
          suggested_action: suggestedAction,
          confidence_score: scored.confidence_score,
          risk_flags: scored.risk_flags
        };
      })
      .filter((contact) => contact.risk_flags.some((flag) => GENERIC_ACTION_FLAGS.has(flag)));
  }

  async listDuplicateGroups(user: AuthUser, input: { organizationId?: string | null; limit?: number }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, false);
    return withClient(async (client) => {
      const result = await client.query(
        `
          with phone_groups as (
            select primary_phone_normalized as group_key, primary_phone_normalized as normalized_phone, array_agg(id) as contact_ids
            from contacts
            where organization_id = $1
              and deleted_at is null
              and coalesce(status, 'active') != 'merged'
              and primary_phone_normalized is not null
            group by primary_phone_normalized
            having count(*) > 1
            limit $2
          )
          select * from phone_groups
        `,
        [organizationId, clampLimit(input.limit)]
      );

      const groups = [];
      for (const group of result.rows) {
        const rows = await fetchReliabilityRows(client, {
          organizationId,
          contactIds: group.contact_ids,
          limit: 20,
          offset: 0
        });
        const contacts = rows
          .filter((row) => group.contact_ids.includes(row.id))
          .map(toRiskyContact)
          .sort((a, b) => b.confidence_score - a.confidence_score || b.conversation_count - a.conversation_count);

        groups.push({
          group_key: `same_phone:${group.group_key}`,
          reason: "same_phone",
          normalized_phone: group.normalized_phone,
          contacts,
          recommended_target_contact_id: contacts[0]?.contact_id ?? null,
          confidence: contacts.length > 1 ? "high" : "low",
          warning_messages: ["Review before merging. Same phone can still represent separate CRM records."]
        });
      }

      return groups;
    });
  }

  async getTimeline(user: AuthUser, input: { organizationId?: string | null; contactId: string }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, false);

    return withClient(async (client) => {
      await assertContactInOrg(client, organizationId!, input.contactId);
      const events: Array<Record<string, unknown>> = [];

      const contact = await client.query(
        `
          select id, display_name, primary_phone_normalized, primary_phone_e164, owner_user_id, created_at, updated_at, status, merged_into_contact_id
          from contacts
          where organization_id = $1 and id = $2
        `,
        [organizationId, input.contactId]
      );
      const contactRow = contact.rows[0];
      if (contactRow) {
        events.push({ event_type: "contact_created", occurred_at: contactRow.created_at, source: "contacts", details: contactRow });
        events.push({ event_type: "contact_updated", occurred_at: contactRow.updated_at, source: "contacts", details: contactRow });
      }

      const identities = await client.query(
        `
          select id, wa_jid, phone_normalized, profile_name, profile_push_name, identity_quality, identity_score, created_at, updated_at, first_seen_at, last_seen_at
          from contact_identities
          where organization_id = $1 and contact_id = $2 and deleted_at is null
          order by coalesce(first_seen_at, created_at) desc
          limit 50
        `,
        [organizationId, input.contactId]
      );
      for (const identity of identities.rows) {
        events.push({ event_type: "identity_added", occurred_at: identity.first_seen_at ?? identity.created_at, source: "contact_identities", details: identity });
        if (identity.last_seen_at) {
          events.push({ event_type: "profile_update_from_whatsapp", occurred_at: identity.last_seen_at, source: "contact_identities", details: identity });
        }
      }

      const conversations = await client.query(
        `
          select id, channel, whatsapp_account_id, created_at, first_message_at, last_message_at
          from conversations
          where organization_id = $1 and contact_id = $2
          order by created_at desc
          limit 50
        `,
        [organizationId, input.contactId]
      );
      for (const conversation of conversations.rows) {
        events.push({ event_type: "conversation_created", occurred_at: conversation.created_at, source: "conversations", details: conversation });
      }

      const messageBounds = await client.query(
        `
          select
            min(coalesce(sent_at, created_at)) filter (where direction = 'incoming') as first_inbound_at,
            min(coalesce(sent_at, created_at)) filter (where direction = 'outgoing') as first_outbound_at
          from messages
          where organization_id = $1 and contact_id = $2 and coalesce(is_deleted, false) = false
        `,
        [organizationId, input.contactId]
      );
      if (messageBounds.rows[0]?.first_inbound_at) {
        events.push({ event_type: "first_inbound_message", occurred_at: messageBounds.rows[0].first_inbound_at, source: "messages", details: {} });
      }
      if (messageBounds.rows[0]?.first_outbound_at) {
        events.push({ event_type: "first_outbound_message", occurred_at: messageBounds.rows[0].first_outbound_at, source: "messages", details: {} });
      }

      const repairProposals = await client.query(
        `
          select id, reason, proposed_action, status, detected_at, reviewed_at, repair_plan
          from contact_repair_proposals
          where organization_id = $1 and contact_id = $2
          order by detected_at desc
          limit 50
        `,
        [organizationId, input.contactId]
      );
      for (const proposal of repairProposals.rows) {
        events.push({ event_type: "merge_proposal_created", occurred_at: proposal.detected_at, source: "contact_repair_proposals", details: proposal });
        if (proposal.reviewed_at) {
          events.push({ event_type: proposal.status === "applied" ? "merge_approved" : "repair_reviewed", occurred_at: proposal.reviewed_at, source: "contact_repair_proposals", details: proposal });
        }
      }

      const mergeHistory = await client.query(
        `
          select id, source_contact_id, target_contact_id, reason, merged_by, created_at
          from contact_merge_history
          where organization_id = $1 and (source_contact_id = $2 or target_contact_id = $2)
          order by created_at desc
          limit 50
        `,
        [organizationId, input.contactId]
      );
      for (const merge of mergeHistory.rows) {
        events.push({ event_type: "merge_performed", occurred_at: merge.created_at, source: "contact_merge_history", details: merge });
      }

      const audit = await client.query(
        `
          select action, actor_role, metadata, created_at
          from audit_logs
          where organization_id = $1 and entity_type = 'contact' and entity_id = $2
          order by created_at desc
          limit 50
        `,
        [organizationId, input.contactId]
      );
      for (const item of audit.rows) {
        events.push({ event_type: item.action, occurred_at: item.created_at, source: "audit_logs", details: item });
      }

      return events
        .filter((event) => event.occurred_at)
        .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
    });
  }

  async applySuggestion(user: AuthUser, input: {
    organizationId?: string | null;
    contactId: string;
    action: "update_name" | "update_phone" | "ignore_flag";
    displayName?: string | null;
    phoneNumber?: string | null;
    flag?: string | null;
    note?: string | null;
  }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, false)!;

    const contact = await withTransaction(async (client) => {
      await ensureIgnoredFlagsTable(client);
      const existing = await assertContactInOrg(client, organizationId, input.contactId);

      if (input.action === "ignore_flag") {
        if (!input.flag) throw new AppError("flag is required", 400, "flag_required");
        await client.query(
          `
            insert into contact_reliability_ignored_flags (organization_id, contact_id, flag, ignored_by_user_id, note)
            values ($1, $2, $3, $4, $5)
            on conflict (organization_id, contact_id, flag)
            do update set ignored_by_user_id = excluded.ignored_by_user_id, note = excluded.note, created_at = timezone('utc', now())
          `,
          [organizationId, input.contactId, input.flag, user.organizationUserId, input.note ?? null]
        );
        return existing;
      }

      if (input.action === "update_name") {
        const displayName = normalizeDisplayName(input.displayName);
        if (!displayName || isWeakDisplayName(displayName)) {
          throw new AppError("A reliable display name is required", 400, "weak_display_name");
        }
        return this.contactCommandService.update(client, {
          organizationId,
          contactId: input.contactId,
          displayName
        });
      }

      if (input.action === "update_phone") {
        const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
        if (!normalizedPhone) {
          throw new AppError("A valid phone number is required", 400, "invalid_phone");
        }
        return this.contactCommandService.update(client, {
          organizationId,
          contactId: input.contactId,
          phoneNumber: normalizedPhone
        });
      }

      throw new AppError("Unsupported suggestion action", 400, "unsupported_action");
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: `contact_reliability.${input.action}`,
      entityType: "contact",
      entityId: input.contactId,
      metadata: { note: input.note ?? null, flag: input.flag ?? null }
    });

    const refreshed = await withClient(async (client) => {
      const rows = await fetchReliabilityRows(client, { organizationId, contactId: input.contactId, limit: 1 });
      return rows[0] ? toRiskyContact(rows[0]) : null;
    });

    return { contact, reliability: refreshed };
  }

  async getMergePreview(user: AuthUser, input: { organizationId?: string | null; sourceContactId: string; targetContactId: string }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, false)!;
    return withClient(async (client) => buildMergePreview(client, organizationId, input.sourceContactId, input.targetContactId));
  }

  async mergeDuplicates(user: AuthUser, input: { organizationId?: string | null; sourceContactId: string; targetContactId: string; note?: string | null }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, false)!;
    const preview = await withClient(async (client) => buildMergePreview(client, organizationId, input.sourceContactId, input.targetContactId));

    if (preview.blocking_errors.length > 0) {
      throw new AppError("Merge preview has blocking errors", 409, "merge_preview_blocked", preview.blocking_errors);
    }

    const mergeUser = user.role === "super_admin" && !user.organizationId ? { ...user, organizationId } : user;
    const result = await ContactRepairProposalService.mergeContactsManually({
      sourceContactId: input.sourceContactId,
      targetContactId: input.targetContactId,
      note: input.note ?? null,
      user: mergeUser
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: "contact_reliability.merge_confirmed",
      entityType: "contact",
      entityId: input.targetContactId,
      metadata: { sourceContactId: input.sourceContactId, targetContactId: input.targetContactId, note: input.note ?? null, preview }
    });

    return { preview, result };
  }

  async revertMerge(user: AuthUser, input: { organizationId?: string | null; mergeHistoryId: string }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, false)!;
    await this.auditLogService.record(user, {
      organizationId,
      action: "contact_reliability.merge_revert_unsupported",
      entityType: "contact_merge_history",
      entityId: input.mergeHistoryId,
      metadata: { reason: "contact_merge_history does not store full before-state snapshots" }
    });
    throw new AppError("Revert not available for this merge yet", 409, "merge_revert_not_supported");
  }

  async recalculate(user: AuthUser, input: { organizationId?: string | null }) {
    const organizationId = resolveOrganizationId(user, input.organizationId, true);
    const summary = await this.getSummary(user, { organizationId, days: 30 });
    await this.auditLogService.record(user, {
      organizationId,
      action: "contact_reliability.recalculate",
      entityType: "contact_reliability",
      metadata: { dynamic: true, scanned: summary.total_contacts }
    });
    return { scanned: summary.total_contacts, summary };
  }
}

async function withClient<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function assertContactInOrg(client: PoolClient, organizationId: string, contactId: string) {
  const result = await client.query(
    `
      select id, organization_id, display_name, primary_phone_normalized, primary_phone_e164, status, merged_into_contact_id
      from contacts
      where organization_id = $1 and id = $2 and deleted_at is null
      limit 1
    `,
    [organizationId, contactId]
  );

  if (!result.rows[0]) {
    throw new AppError("Contact not found", 404, "contact_not_found");
  }

  return result.rows[0];
}

async function ensureIgnoredFlagsTable(client: PoolClient) {
  await client.query(`
    create table if not exists contact_reliability_ignored_flags (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references organizations(id) on delete cascade,
      contact_id uuid not null references contacts(id) on delete cascade,
      flag text not null,
      ignored_by_user_id uuid references organization_users(id) on delete set null,
      note text,
      created_at timestamptz not null default timezone('utc', now()),
      unique (organization_id, contact_id, flag)
    )
  `);
  await client.query(`
    create index if not exists idx_contact_reliability_ignored_flags_contact
    on contact_reliability_ignored_flags (organization_id, contact_id)
  `);
}

async function buildMergePreview(client: PoolClient, organizationId: string, sourceContactId: string, targetContactId: string) {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (sourceContactId === targetContactId) {
    blockingErrors.push("source_equals_target");
  }

  const contacts = await client.query(
    `
      select id, organization_id, display_name, primary_phone_normalized, primary_phone_e164, status, merged_into_contact_id, owner_user_id
      from contacts
      where organization_id = $1 and id in ($2, $3) and deleted_at is null
    `,
    [organizationId, sourceContactId, targetContactId]
  );
  const source = contacts.rows.find((row) => row.id === sourceContactId) ?? null;
  const target = contacts.rows.find((row) => row.id === targetContactId) ?? null;

  if (!source || !target) {
    blockingErrors.push("different_organization_or_missing_contact");
  }

  if (target?.status === "merged" || target?.merged_into_contact_id) {
    blockingErrors.push("target_already_merged");
  }

  if (source && target && source.primary_phone_normalized && target.primary_phone_normalized && source.primary_phone_normalized !== target.primary_phone_normalized) {
    warnings.push("source_has_conflicting_phone");
  }

  const counts = await client.query(
    `
      select
        (select count(*)::integer from contact_identities where organization_id = $1 and contact_id = $2 and deleted_at is null) as identities_to_move,
        (select count(*)::integer from conversations where organization_id = $1 and contact_id = $2) as conversations_to_move,
        (select count(*)::integer from messages where organization_id = $1 and contact_id = $2) as messages_affected_count,
        (select count(*)::integer from leads where organization_id = $1 and contact_id = $2) as leads_affected_count,
        (select count(*)::integer from sales_orders where organization_id = $1 and contact_id = $2) as sales_affected_count
    `,
    [organizationId, sourceContactId]
  );

  const duplicateConversations = await client.query(
    `
      select count(*)::integer as count
      from conversations source_conv
      join conversations target_conv
        on target_conv.organization_id = source_conv.organization_id
       and target_conv.whatsapp_account_id is not distinct from source_conv.whatsapp_account_id
       and target_conv.contact_id = $3
       and target_conv.id != source_conv.id
      where source_conv.organization_id = $1
        and source_conv.contact_id = $2
    `,
    [organizationId, sourceContactId, targetContactId]
  );

  if ((duplicateConversations.rows[0]?.count ?? 0) > 0) {
    warnings.push("duplicate_conversation_constraints_will_be_merged");
  }

  return {
    source_contact: source,
    target_contact: target,
    fields_to_keep: {
      display_name: target?.display_name ?? source?.display_name ?? null,
      primary_phone_normalized: target?.primary_phone_normalized ?? source?.primary_phone_normalized ?? null,
      owner_user_id: target?.owner_user_id ?? source?.owner_user_id ?? null
    },
    fields_to_move: {
      source_status: "merged",
      source_merged_into_contact_id: targetContactId
    },
    identities_to_move: counts.rows[0]?.identities_to_move ?? 0,
    conversations_to_move: counts.rows[0]?.conversations_to_move ?? 0,
    messages_affected_count: counts.rows[0]?.messages_affected_count ?? 0,
    leads_affected_count: counts.rows[0]?.leads_affected_count ?? 0,
    sales_affected_count: counts.rows[0]?.sales_affected_count ?? 0,
    warnings,
    blocking_errors: blockingErrors
  };
}
