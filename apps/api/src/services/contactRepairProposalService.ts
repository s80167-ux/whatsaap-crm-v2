import { withTransaction } from "../config/database.js";
import { isWeakDisplayName, normalizeDisplayName } from "../utils/contactIdentity.js";
import { AuditLogService } from "./auditLogService.js";
import { ContactIdentityRepairService } from "./contactIdentityRepairService.js";

function requireReviewer(user: any) {
  if (!user || (user.role !== "org_admin" && user.role !== "super_admin")) {
    throw new Error("Insufficient permissions: org_admin or super_admin required");
  }
}

function extractPhoneFromJid(jid: string | null | undefined): string | null {
  if (!jid || typeof jid !== "string") return null;
  if (!jid.includes("@")) return null;

  const phone = jid.split("@")[0]?.replace(/\D/g, "") ?? "";

  // Only accept Malaysian WhatsApp mobile numbers.
  // Example accepted: 60123456789, 60139229833
  // Rejects non-Malaysia numbers, group IDs, broadcast IDs, and invalid JIDs.
  if (!/^601\d{7,10}$/.test(phone)) return null;

  return phone;
}

async function detectDuplicateContacts(client: any, contactId: string, orgId: string) {
  const base = await client.query(
    `
      select id, display_name
      from contacts
      where id = $1 and organization_id = $2
    `,
    [contactId, orgId]
  );

  const contact = base.rows[0];
  if (!contact?.display_name) return null;

  const duplicates = await client.query(
    `
      select id, display_name
      from contacts
      where organization_id = $1
        and id != $2
        and lower(display_name) = lower($3)
        and (status is null or status = 'active')
      limit 5
    `,
    [orgId, contactId, contact.display_name]
  );

  if (duplicates.rows.length === 0) return null;

  return {
    target: contact,
    candidates: duplicates.rows
  };
}

function normalizeE164FromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function resolveCandidatePhoneFromContact(client: any, contactId: string) {
  let candidatePhone: string | null = null;
  let candidateJid: string | null = null;
  const checkedSources: string[] = [];

  async function tryJid(jid: unknown, source: string) {
    if (typeof jid !== "string" || candidatePhone) {
      return;
    }

    checkedSources.push(source);
    const phone = extractPhoneFromJid(jid);

    if (phone) {
      candidatePhone = phone;
      candidateJid = jid;
    }
  }

  /*
   * Important:
   * Do not query contact_identities.external_id here.
   * Current production schema does not have external_id in contact_identities.
   * We resolve from conversation/message JID fields only.
   */

  if (!candidatePhone) {
    const conversationResult = await client.query(
      `
        select *
        from conversations
        where contact_id = $1
        order by last_message_at desc nulls last, updated_at desc nulls last, created_at desc nulls last
        limit 10
      `,
      [contactId]
    );

    for (const row of conversationResult.rows) {
      await tryJid(row.external_jid, "conversations.external_jid");
      await tryJid(row.thread_jid, "conversations.thread_jid");
      await tryJid(row.remote_jid, "conversations.remote_jid");
      await tryJid(row.external_thread_id, "conversations.external_thread_id");
      await tryJid(row.chat_jid, "conversations.chat_jid");
      await tryJid(row.jid, "conversations.jid");
    }
  }

  if (!candidatePhone) {
    const messageResult = await client.query(
      `
        select *
        from messages
        where contact_id = $1
        order by sent_at desc nulls last, created_at desc nulls last
        limit 20
      `,
      [contactId]
    );

    for (const row of messageResult.rows) {
      await tryJid(row.remote_jid, "messages.remote_jid");
      await tryJid(row.sender_jid, "messages.sender_jid");
      await tryJid(row.participant_jid, "messages.participant_jid");
      await tryJid(row.external_chat_id, "messages.external_chat_id");
      await tryJid(row.chat_jid, "messages.chat_jid");
      await tryJid(row.jid, "messages.jid");
      await tryJid(row.from_jid, "messages.from_jid");
      await tryJid(row.to_jid, "messages.to_jid");
    }
  }

  return {
    candidatePhone,
    candidateJid,
    candidatePhoneE164: normalizeE164FromPhone(candidatePhone),
    checkedSources
  };
}

async function tableExists(client: any, tableName: string) {
  const result = await client.query(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = $1
      ) as exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
}

async function tableColumnExists(client: any, tableName: string, columnName: string) {
  const result = await client.query(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
          and column_name = $2
      ) as exists
    `,
    [tableName, columnName]
  );

  return Boolean(result.rows[0]?.exists);
}

export async function applyDuplicateContactMerge(
  client: any,
  input: {
    organizationId: string;
    sourceContactId: string;
    targetContactId: string;
    mergedBy: string | null;
  }
) {
  if (!input.sourceContactId || !input.targetContactId) {
    throw new Error("Invalid duplicate merge plan");
  }

  if (input.sourceContactId === input.targetContactId) {
    throw new Error("Source and target contact cannot be the same");
  }

  const contactCheck = await client.query(
    `
      select id
      from contacts
      where organization_id = $1
        and id in ($2, $3)
    `,
    [input.organizationId, input.sourceContactId, input.targetContactId]
  );

  if (contactCheck.rows.length !== 2) {
    throw new Error("Duplicate merge contacts must belong to the same organization");
  }

  const movedCounts: Record<string, number> = {
    conversations: 0,
    conversationsMerged: 0,
    messages: 0,
    contactIdentities: 0,
    contactOwners: 0
  };

  const movedIdentities = await client.query(
    `
      update contact_identities
      set contact_id = $1,
          is_primary = false,
          updated_at = timezone('utc', now())
      where organization_id = $2
        and contact_id = $3
      returning id
    `,
    [input.targetContactId, input.organizationId, input.sourceContactId]
  );
  movedCounts.contactIdentities = movedIdentities.rowCount ?? 0;

  if (await tableExists(client, "contact_owners")) {
    await client.query(
      `
        delete from contact_owners source_owner
        using contact_owners target_owner
        where source_owner.organization_id = $1
          and source_owner.contact_id = $2
          and target_owner.organization_id = source_owner.organization_id
          and target_owner.contact_id = $3
          and target_owner.organization_user_id = source_owner.organization_user_id
      `,
      [input.organizationId, input.sourceContactId, input.targetContactId]
    );

    const movedOwners = await client.query(
      `
        update contact_owners
        set contact_id = $1
        where organization_id = $2
          and contact_id = $3
        returning id
      `,
      [input.targetContactId, input.organizationId, input.sourceContactId]
    );
    movedCounts.contactOwners = movedOwners.rowCount ?? 0;
  }

  const sourceConversations = await client.query(
    `
      select *
      from conversations
      where organization_id = $1
        and contact_id = $2
      order by updated_at desc nulls last, created_at desc nulls last
    `,
    [input.organizationId, input.sourceContactId]
  );

  for (const sourceConversation of sourceConversations.rows) {
    const targetConversationResult = await client.query(
      `
        select *
        from conversations
        where organization_id = $1
          and whatsapp_account_id = $2
          and contact_id = $3
          and id != $4
        order by last_message_at desc nulls last, updated_at desc nulls last
        limit 1
      `,
      [
        input.organizationId,
        sourceConversation.whatsapp_account_id,
        input.targetContactId,
        sourceConversation.id
      ]
    );

    const targetConversation = targetConversationResult.rows[0] ?? null;

    if (targetConversation) {
      const movedMessages = await client.query(
        `
          update messages
          set conversation_id = $1,
              contact_id = $2,
              updated_at = timezone('utc', now())
          where organization_id = $3
            and conversation_id = $4
          returning id
        `,
        [targetConversation.id, input.targetContactId, input.organizationId, sourceConversation.id]
      );
      movedCounts.messages += movedMessages.rowCount ?? 0;

      await client.query(
        `
          update conversations
          set first_message_at = case
                when first_message_at is null then $2
                when $2::timestamptz is null then first_message_at
                else least(first_message_at, $2::timestamptz)
              end,
              last_message_at = greatest(
                coalesce(last_message_at, '-infinity'::timestamptz),
                coalesce($3::timestamptz, '-infinity'::timestamptz)
              ),
              last_incoming_at = greatest(
                coalesce(last_incoming_at, '-infinity'::timestamptz),
                coalesce($4::timestamptz, '-infinity'::timestamptz)
              ),
              last_outgoing_at = greatest(
                coalesce(last_outgoing_at, '-infinity'::timestamptz),
                coalesce($5::timestamptz, '-infinity'::timestamptz)
              ),
              unread_count = coalesce(unread_count, 0) + coalesce($6::integer, 0),
              updated_at = timezone('utc', now())
          where id = $1
            and organization_id = $7
        `,
        [
          targetConversation.id,
          sourceConversation.first_message_at,
          sourceConversation.last_message_at,
          sourceConversation.last_incoming_at,
          sourceConversation.last_outgoing_at,
          sourceConversation.unread_count ?? 0,
          input.organizationId
        ]
      );

      await client.query(
        `
          delete from conversations
          where id = $1
            and organization_id = $2
        `,
        [sourceConversation.id, input.organizationId]
      );

      movedCounts.conversationsMerged += 1;
    } else {
      const updatedConversation = await client.query(
        `
          update conversations
          set contact_id = $1,
              updated_at = timezone('utc', now())
          where id = $2
            and organization_id = $3
          returning id
        `,
        [input.targetContactId, sourceConversation.id, input.organizationId]
      );
      movedCounts.conversations += updatedConversation.rowCount ?? 0;
    }
  }

  const remainingMessages = await client.query(
    `
      update messages
      set contact_id = $1,
          updated_at = timezone('utc', now())
      where organization_id = $2
        and contact_id = $3
      returning id
    `,
    [input.targetContactId, input.organizationId, input.sourceContactId]
  );
  movedCounts.messages += remainingMessages.rowCount ?? 0;

  const optionalContactTables = [
    { tableName: "leads", columnName: "contact_id" },
    { tableName: "activities", columnName: "contact_id" },
    { tableName: "sales_orders", columnName: "contact_id" },
    { tableName: "message_dispatch_outbox", columnName: "contact_id" },
    { tableName: "quick_reply_message_events", columnName: "contact_id" },
    { tableName: "campaign_audience_contacts", columnName: "crm_contact_id" },
    { tableName: "campaign_dispatches", columnName: "crm_contact_id" }
  ];
  for (const { tableName, columnName } of optionalContactTables) {
    if (!(await tableExists(client, tableName))) continue;
    if (!(await tableColumnExists(client, tableName, columnName))) continue;

    const result = await client.query(
      `
        update ${tableName}
        set ${columnName} = $1
        where organization_id = $2
          and ${columnName} = $3
        returning id
      `,
      [input.targetContactId, input.organizationId, input.sourceContactId]
    );

    movedCounts[tableName] = result.rowCount ?? 0;
  }

  const source = await client.query(
    `
      update contacts
      set status = 'merged',
          merged_into_contact_id = $1,
          merged_at = timezone('utc', now()),
          merged_by = $2,
          updated_at = timezone('utc', now())
      where id = $3
        and organization_id = $4
      returning id, status, merged_into_contact_id
    `,
    [input.targetContactId, input.mergedBy, input.sourceContactId, input.organizationId]
  );

  if (await tableExists(client, "contact_merge_history")) {
    await client.query(
      `
        insert into contact_merge_history (
          organization_id,
          source_contact_id,
          target_contact_id,
          reason,
          merged_by
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        input.organizationId,
        input.sourceContactId,
        input.targetContactId,
        "manual_duplicate_contact_merge",
        input.mergedBy
      ]
    );
  }

  return {
    sourceContact: source.rows[0] ?? null,
    targetContactId: input.targetContactId,
    movedCounts
  };
}

export class ContactRepairProposalService {
  private static async ensureTableOnClient(client: any) {
    await client.query(`
      create table if not exists contact_repair_proposals (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null,
        contact_id uuid not null,
        status text not null default 'pending',
        reason text not null,
        confidence text not null default 'medium',
        proposed_action text not null,
        before_snapshot jsonb not null default '{}'::jsonb,
        proposed_after_snapshot jsonb not null default '{}'::jsonb,
        repair_plan jsonb not null default '{}'::jsonb,
        detected_at timestamptz not null default timezone('utc', now()),
        reviewed_at timestamptz,
        reviewed_by uuid,
        review_note text,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query(`
      create index if not exists idx_contact_repair_proposals_org_status
      on contact_repair_proposals (organization_id, status, detected_at desc)
    `);
    await client.query(`
      create index if not exists idx_contact_repair_proposals_contact
      on contact_repair_proposals (contact_id, status)
    `);
  }

  static async ensureTable() {
    await withTransaction(async (client: any) => {
      await this.ensureTableOnClient(client);
    });
  }

  static async detectWeakIdentityForContact(
    client: any,
    input: { organizationId: string; contactId: string }
  ): Promise<{ created: boolean; issueType?: string; proposedAction?: string }> {
    await this.ensureTableOnClient(client);

    const result = await client.query(
      `
        select
          c.id,
          c.organization_id,
          c.display_name,
          c.primary_phone_normalized,
          c.primary_phone_e164,
          c.primary_avatar_url,
          c.identity_status,
          latest_identity.wa_jid,
          latest_identity.phone_normalized as identity_phone_normalized,
          latest_identity.profile_name,
          latest_identity.profile_push_name,
          latest_identity.profile_avatar_url as identity_avatar_url,
          latest_identity.identity_quality,
          latest_identity.identity_score,
          best_name.profile_name as best_known_identity_name,
          phone_conflict.conflicting_contact_ids
        from contacts c
        left join lateral (
          select *
          from contact_identities ci
          where ci.contact_id = c.id
            and coalesce(ci.is_active, true)
            and ci.deleted_at is null
          order by ci.last_seen_at desc nulls last, ci.updated_at desc, ci.created_at desc, ci.id desc
          limit 1
        ) latest_identity on true
        left join lateral (
          select nullif(trim(ci.profile_name), '') as profile_name
          from contact_identities ci
          where ci.contact_id = c.id
            and coalesce(ci.is_active, true)
            and ci.deleted_at is null
            and nullif(trim(ci.profile_name), '') is not null
            and lower(trim(ci.profile_name)) not in ('unknown', 'customer', 'no name', 'whatsapp', 'business', 'user', 'device', 'iphone', 'android', 'test', 'admin', 'contact')
          order by ci.identity_score desc nulls last, ci.last_seen_at desc nulls last, ci.updated_at desc
          limit 1
        ) best_name on true
        left join lateral (
          select array_agg(distinct ci.contact_id) filter (where ci.contact_id != c.id) as conflicting_contact_ids
          from contact_identities ci
          where ci.organization_id = c.organization_id
            and ci.deleted_at is null
            and coalesce(ci.is_active, true)
            and ci.phone_normalized is not null
            and ci.phone_normalized = coalesce(c.primary_phone_normalized, latest_identity.phone_normalized)
        ) phone_conflict on true
        where c.id = $1
          and c.organization_id = $2
        limit 1
      `,
      [input.contactId, input.organizationId]
    );

    const row = result.rows[0];

    if (!row) {
      return { created: false };
    }

    const hasNoPhone = !row.primary_phone_normalized && !row.primary_phone_e164;
    const hasAvatar = Boolean(normalizeDisplayName(row.primary_avatar_url) || normalizeDisplayName(row.identity_avatar_url));
    const displayNameIsWeak = isWeakDisplayName(row.display_name);
    const conflictingContactIds = Array.isArray(row.conflicting_contact_ids)
      ? row.conflicting_contact_ids.filter(Boolean)
      : [];

    let issueType: string | null = null;
    let reason: string | null = null;
    let proposedAction: string | null = null;
    let confidence = "medium";

    if (conflictingContactIds.length > 0) {
      issueType = "conflicting_identity_phone";
      reason = "Multiple contacts have identities pointing to the same normalized phone.";
      proposedAction = "merge_duplicate_contact";
      confidence = "high";
    } else if (hasAvatar && hasNoPhone) {
      issueType = "avatar_without_phone";
      reason = "Profile picture exists but phone number is missing.";
      proposedAction = "resolve_missing_phone_from_whatsapp_identity";
      confidence = "high";
    } else if (row.identity_quality === "lid_only" && hasNoPhone) {
      issueType = "lid_without_phone";
      reason = "Latest WhatsApp identity is LID-only and the contact has no phone number.";
      proposedAction = "resolve_lid_identity";
      confidence = "high";
    } else if (displayNameIsWeak && row.best_known_identity_name) {
      issueType = "unknown_name_with_previous_identity";
      reason = "Contact display name is weak but a better previous identity name exists.";
      proposedAction = "restore_best_known_name";
    } else if (row.identity_quality === "weak" || row.identity_status === "provisional") {
      issueType = "weak_identity_created";
      reason = "Contact was created from weak WhatsApp identity metadata.";
      proposedAction = "review_weak_identity";
    }

    if (!issueType || !reason || !proposedAction) {
      return { created: false };
    }

    const existing = await client.query(
      `
        select id
        from contact_repair_proposals
        where organization_id = $1
          and contact_id = $2
          and status = 'pending'
          and proposed_action = $3
        limit 1
      `,
      [input.organizationId, input.contactId, proposedAction]
    );

    if (existing.rows[0]) {
      return { created: false, issueType, proposedAction };
    }

    await client.query(
      `
        insert into contact_repair_proposals (
          organization_id,
          contact_id,
          status,
          reason,
          confidence,
          proposed_action,
          before_snapshot,
          proposed_after_snapshot,
          repair_plan
        ) values ($1, $2, 'pending', $3, $4, $5, $6, $7, $8)
      `,
      [
        input.organizationId,
        input.contactId,
        reason,
        confidence,
        proposedAction,
        row,
        row.best_known_identity_name ? { display_name: row.best_known_identity_name } : {},
        {
          issue_type: issueType,
          proposed_action: proposedAction,
          merge_mode: proposedAction === "merge_duplicate_contact" ? "admin_approval_required" : "admin_review_required",
          conflicting_contact_ids: conflictingContactIds,
          best_known_identity_name: row.best_known_identity_name ?? null
        }
      ]
    );

    return { created: true, issueType, proposedAction };
  }

  static async detectBackfillDuplicateRepairProposals(input: {
    organizationId: string;
    whatsappAccountId?: string | null;
  }): Promise<{ created: number; candidates: number }> {
    return withTransaction(async (client: any) => {
      await this.ensureTableOnClient(client);

      const candidates: Array<{
        contact_id: string;
        reason: string;
        proposed_action: string;
        confidence: string;
        issue_type: string;
        repair_plan: Record<string, unknown>;
        before_snapshot: Record<string, unknown>;
        proposed_after_snapshot: Record<string, unknown>;
      }> = [];

      const duplicateContacts = await client.query(
        `
          with duplicate_groups as (
            select organization_id, primary_phone_normalized
            from contacts
            where organization_id = $1
              and primary_phone_normalized is not null
              and deleted_at is null
              and coalesce(status, 'active') != 'merged'
            group by organization_id, primary_phone_normalized
            having count(*) > 1
          ),
          ranked as (
            select
              c.*,
              row_number() over (
                partition by c.organization_id, c.primary_phone_normalized
                order by
                  case when c.is_anchor_locked then 1 else 0 end desc,
                  case when nullif(trim(c.display_name), '') is not null then 1 else 0 end desc,
                  c.updated_at desc nulls last,
                  c.created_at asc nulls last,
                  c.id
              ) as duplicate_rank,
              first_value(c.id) over (
                partition by c.organization_id, c.primary_phone_normalized
                order by
                  case when c.is_anchor_locked then 1 else 0 end desc,
                  case when nullif(trim(c.display_name), '') is not null then 1 else 0 end desc,
                  c.updated_at desc nulls last,
                  c.created_at asc nulls last,
                  c.id
              ) as target_contact_id
            from contacts c
            join duplicate_groups dg
              on dg.organization_id = c.organization_id
             and dg.primary_phone_normalized = c.primary_phone_normalized
            where c.deleted_at is null
              and coalesce(c.status, 'active') != 'merged'
          )
          select id as source_contact_id, target_contact_id, primary_phone_normalized, display_name
          from ranked
          where duplicate_rank > 1
          limit 100
        `,
        [input.organizationId]
      );

      for (const row of duplicateContacts.rows) {
        candidates.push({
          contact_id: row.source_contact_id,
          reason: "Duplicate contacts share the same normalized phone. Merge requires admin approval.",
          proposed_action: "merge_duplicate_contact",
          confidence: "high",
          issue_type: "duplicate_contact_phone",
          before_snapshot: row,
          proposed_after_snapshot: { target_contact_id: row.target_contact_id },
          repair_plan: {
            issue_type: "duplicate_contact_phone",
            duplicate_contact: {
              source_contact_id: row.source_contact_id,
              target_contact_id: row.target_contact_id,
              duplicate_signals: ["same_primary_phone_normalized"],
              merge_mode: "admin_approval_required"
            }
          }
        });
      }

      const duplicateIdentities = await client.query(
        `
          with duplicate_identity_groups as (
            select organization_id, phone_normalized
            from contact_identities
            where organization_id = $1
              and ($2::uuid is null or whatsapp_account_id = $2)
              and phone_normalized is not null
              and deleted_at is null
              and coalesce(is_active, true)
            group by organization_id, phone_normalized
            having count(distinct contact_id) > 1
          ),
          ranked as (
            select
              ci.*,
              row_number() over (
                partition by ci.organization_id, ci.phone_normalized
                order by
                  coalesce(ci.identity_score, 0) desc,
                  ci.last_seen_at desc nulls last,
                  ci.updated_at desc nulls last,
                  ci.created_at asc nulls last,
                  ci.id
              ) as duplicate_rank,
              first_value(ci.contact_id) over (
                partition by ci.organization_id, ci.phone_normalized
                order by
                  coalesce(ci.identity_score, 0) desc,
                  ci.last_seen_at desc nulls last,
                  ci.updated_at desc nulls last,
                  ci.created_at asc nulls last,
                  ci.id
              ) as target_contact_id
            from contact_identities ci
            join duplicate_identity_groups dig
              on dig.organization_id = ci.organization_id
             and dig.phone_normalized = ci.phone_normalized
            where ci.deleted_at is null
              and coalesce(ci.is_active, true)
          )
          select contact_id as source_contact_id, target_contact_id, phone_normalized, wa_jid, identity_quality, identity_score
          from ranked
          where duplicate_rank > 1
            and contact_id != target_contact_id
          limit 100
        `,
        [input.organizationId, input.whatsappAccountId ?? null]
      );

      for (const row of duplicateIdentities.rows) {
        candidates.push({
          contact_id: row.source_contact_id,
          reason: "Multiple contact identities point to the same normalized phone on different contacts.",
          proposed_action: "merge_duplicate_contact",
          confidence: "high",
          issue_type: "duplicate_identity_phone",
          before_snapshot: row,
          proposed_after_snapshot: { target_contact_id: row.target_contact_id },
          repair_plan: {
            issue_type: "duplicate_identity_phone",
            duplicate_contact: {
              source_contact_id: row.source_contact_id,
              target_contact_id: row.target_contact_id,
              duplicate_signals: ["same_identity_phone_normalized"],
              merge_mode: "admin_approval_required"
            }
          }
        });
      }

      const likelyLidMatches = await client.query(
        `
          with lid_contacts as (
            select
              c.id as lid_contact_id,
              c.display_name,
              ci.wa_jid,
              coalesce(nullif(trim(c.display_name), ''), nullif(trim(ci.profile_name), '')) as match_name
            from contacts c
            join contact_identities ci on ci.contact_id = c.id
            where c.organization_id = $1
              and ($2::uuid is null or ci.whatsapp_account_id = $2)
              and c.primary_phone_normalized is null
              and c.primary_phone_e164 is null
              and ci.deleted_at is null
              and coalesce(ci.is_active, true)
              and ci.wa_jid like '%@lid'
          ),
          phone_contacts as (
            select
              c.id as phone_contact_id,
              c.display_name,
              c.primary_phone_normalized,
              coalesce(nullif(trim(c.display_name), ''), nullif(trim(ci.profile_name), '')) as match_name
            from contacts c
            left join contact_identities ci on ci.contact_id = c.id
              and ci.deleted_at is null
              and coalesce(ci.is_active, true)
            where c.organization_id = $1
              and c.primary_phone_normalized is not null
              and c.deleted_at is null
              and coalesce(c.status, 'active') != 'merged'
          )
          select
            lc.lid_contact_id as source_contact_id,
            pc.phone_contact_id as target_contact_id,
            lc.wa_jid,
            pc.primary_phone_normalized,
            lc.match_name
          from lid_contacts lc
          join phone_contacts pc
            on lower(trim(lc.match_name)) = lower(trim(pc.match_name))
          where nullif(trim(lc.match_name), '') is not null
            and lower(trim(lc.match_name)) not in ('unknown', 'customer', 'no name', 'whatsapp', 'business', 'user', 'device', 'iphone', 'android', 'test', 'admin', 'contact')
            and lc.lid_contact_id != pc.phone_contact_id
          limit 100
        `,
        [input.organizationId, input.whatsappAccountId ?? null]
      );

      for (const row of likelyLidMatches.rows) {
        candidates.push({
          contact_id: row.source_contact_id,
          reason: "LID-only contact likely matches a phone contact by non-weak display name. Merge requires admin approval.",
          proposed_action: "merge_duplicate_contact",
          confidence: "medium",
          issue_type: "lid_only_likely_phone_match",
          before_snapshot: row,
          proposed_after_snapshot: { target_contact_id: row.target_contact_id },
          repair_plan: {
            issue_type: "lid_only_likely_phone_match",
            duplicate_contact: {
              source_contact_id: row.source_contact_id,
              target_contact_id: row.target_contact_id,
              duplicate_signals: ["same_non_weak_display_name", "lid_without_phone_matches_phone_contact"],
              merge_mode: "admin_approval_required"
            }
          }
        });
      }

      const duplicateConversations = await client.query(
        `
          with duplicate_conversations as (
            select organization_id, whatsapp_account_id, contact_id
            from conversations
            where organization_id = $1
              and ($2::uuid is null or whatsapp_account_id = $2)
              and channel = 'whatsapp'
            group by organization_id, whatsapp_account_id, contact_id
            having count(*) > 1
          )
          select
            dc.contact_id,
            dc.whatsapp_account_id,
            array_agg(c.id order by c.last_message_at desc nulls last, c.updated_at desc nulls last) as conversation_ids
          from duplicate_conversations dc
          join conversations c
            on c.organization_id = dc.organization_id
           and c.whatsapp_account_id = dc.whatsapp_account_id
           and c.contact_id = dc.contact_id
           and c.channel = 'whatsapp'
          group by dc.contact_id, dc.whatsapp_account_id
          limit 100
        `,
        [input.organizationId, input.whatsappAccountId ?? null]
      );

      for (const row of duplicateConversations.rows) {
        candidates.push({
          contact_id: row.contact_id,
          reason: "Duplicate conversations exist for the same organization, WhatsApp account, and contact.",
          proposed_action: "review_duplicate_conversations",
          confidence: "high",
          issue_type: "duplicate_conversation",
          before_snapshot: row,
          proposed_after_snapshot: {},
          repair_plan: {
            issue_type: "duplicate_conversation",
            conversation_ids: row.conversation_ids,
            repair_function: "repair_duplicate_conversations_for_contact",
            merge_mode: "admin_approval_required"
          }
        });
      }

      let created = 0;

      for (const candidate of candidates) {
        const existing = await client.query(
          `
            select id
            from contact_repair_proposals
            where organization_id = $1
              and contact_id = $2
              and status = 'pending'
              and proposed_action = $3
            limit 1
          `,
          [input.organizationId, candidate.contact_id, candidate.proposed_action]
        );

        if (existing.rows[0]) {
          continue;
        }

        await client.query(
          `
            insert into contact_repair_proposals (
              organization_id,
              contact_id,
              status,
              reason,
              confidence,
              proposed_action,
              before_snapshot,
              proposed_after_snapshot,
              repair_plan
            ) values ($1, $2, 'pending', $3, $4, $5, $6, $7, $8)
          `,
          [
            input.organizationId,
            candidate.contact_id,
            candidate.reason,
            candidate.confidence,
            candidate.proposed_action,
            candidate.before_snapshot,
            candidate.proposed_after_snapshot,
            candidate.repair_plan
          ]
        );
        created += 1;
      }

      return { created, candidates: candidates.length };
    });
  }

  static async detectForContact(contactId: string, options: { user: any }) {
    requireReviewer(options.user);
    await this.ensureTable();

    const previewUser = { ...options.user };
    const preview = await ContactIdentityRepairService.refreshContactIdentity(contactId, {
      dry_run: true,
      confirm: false,
      user: previewUser
    });

    const duplicate = await withTransaction(async (client: any) => {
      return await detectDuplicateContacts(client, contactId, options.user.organizationId);
    });

    const plan = preview.repairPlan ?? {};
    let contactRow: any = null;
    let candidate: {
      candidatePhone: string | null;
      candidateJid: string | null;
      candidatePhoneE164: string | null;
      checkedSources: string[];
    } = {
      candidatePhone: null,
      candidateJid: null,
      candidatePhoneE164: null,
      checkedSources: []
    };

    await withTransaction(async (client: any) => {
      const contactResult = await client.query(
        `
          select id, organization_id, display_name, primary_phone_normalized, primary_phone_e164
          from contacts
          where id = $1
            and organization_id = $2
          limit 1
        `,
        [contactId, options.user.organizationId]
      );

      contactRow = contactResult.rows[0] ?? null;

      if (!contactRow) {
        throw new Error("Contact not found");
      }

      if (!contactRow.primary_phone_normalized && !contactRow.primary_phone_e164) {
        candidate = await resolveCandidatePhoneFromContact(client, contactId);
      }
    });

    const hasMissingPhoneCandidate = Boolean(
      !contactRow?.primary_phone_normalized &&
        !contactRow?.primary_phone_e164 &&
        candidate.candidatePhone
    );

    const hasDuplicate = Boolean(duplicate && duplicate.candidates.length > 0);

    const shouldPropose = Boolean(
      plan.currentNameIsBlocked ||
        (plan.poisonedIdentityCount ?? 0) > 0 ||
        hasMissingPhoneCandidate ||
        hasDuplicate
    );

    if (!shouldPropose) {
      const weakIdentityProposal = await withTransaction(async (client: any) => {
        return await this.detectWeakIdentityForContact(client, {
          organizationId: options.user.organizationId,
          contactId
        });
      });

      if (weakIdentityProposal.created) {
        return {
          created: true,
          status: "pending",
          preview,
          candidate,
          weakIdentityProposal
        };
      }

      return {
        created: false,
        status: "clean",
        preview,
        candidate
      };
    }

    const duplicateTarget = hasDuplicate ? duplicate!.target : null;
    const duplicateCandidate = hasDuplicate ? duplicate!.candidates[0] : null;

    const enhancedPlan = {
      ...plan,
      issue_type: hasDuplicate
        ? "duplicate_contact"
        : hasMissingPhoneCandidate
          ? "missing_phone"
          : "identity_issue",
      candidate_phone: candidate.candidatePhone,
      candidate_phone_e164: candidate.candidatePhoneE164,
      candidate_jid: candidate.candidateJid,
      candidate_sources_checked: candidate.checkedSources,
      duplicate_contact:
        hasDuplicate && duplicateCandidate && duplicateTarget
          ? {
              source_contact_id: duplicateCandidate.id,
              target_contact_id: duplicateTarget.id,
              source_display_name: duplicateCandidate.display_name,
              target_display_name: duplicateTarget.display_name,
              duplicate_signals: ["same_normalized_name"],
              merge_mode: "admin_approval_required"
            }
          : null,
      proposed_steps: [
        ...(hasMissingPhoneCandidate ? ["set_primary_phone_from_whatsapp_jid"] : []),
        ...(hasDuplicate ? ["merge_duplicate_contact"] : []),
        ...(plan.currentNameIsBlocked || (plan.poisonedIdentityCount ?? 0) > 0
          ? ["clear_poisoned_identity_and_wrong_contact_name"]
          : []),
        "rebuild_contact_projection"
      ]
    };

    let proposal: any = null;
    await withTransaction(async (client: any) => {
      const existing = await client.query(
        `
          select *
          from contact_repair_proposals
          where organization_id = $1
            and contact_id = $2
            and status = 'pending'
          order by detected_at desc
          limit 1
        `,
        [options.user.organizationId, contactId]
      );

      if (existing.rows[0]) {
        proposal = existing.rows[0];
        return;
      }

      const result = await client.query(
        `
          insert into contact_repair_proposals (
            organization_id,
            contact_id,
            status,
            reason,
            confidence,
            proposed_action,
            before_snapshot,
            proposed_after_snapshot,
            repair_plan
          ) values ($1, $2, 'pending', $3, $4, $5, $6, $7, $8)
          returning *
        `,
        [
          options.user.organizationId,
          contactId,
          hasDuplicate
            ? "Duplicate contact detected. Merge requires admin approval."
            : hasMissingPhoneCandidate
              ? "Missing phone detected. Candidate phone resolved from WhatsApp JID."
              : "Contact name or identity matches a connected WhatsApp account label/display name.",
          hasDuplicate || hasMissingPhoneCandidate || plan.currentNameIsBlocked ? "high" : "medium",
          hasDuplicate
            ? "merge_duplicate_contact"
            : hasMissingPhoneCandidate
              ? "set_missing_phone_from_whatsapp_jid"
              : "clear_poisoned_identity_and_wrong_contact_name",
          preview.before ?? {},
          {
            ...(preview.after ?? {}),
            primary_phone_normalized:
              candidate.candidatePhone ?? (preview.after as any)?.primary_phone_normalized ?? null,
            primary_phone_e164:
              candidate.candidatePhoneE164 ?? (preview.after as any)?.primary_phone_e164 ?? null,
            duplicate_contact: enhancedPlan.duplicate_contact
          },
          enhancedPlan
        ]
      );

      proposal = result.rows[0];
    });

    await new AuditLogService().record(options.user, {
      action: "contact.repair_proposal.detected",
      entityType: "contact",
      entityId: contactId,
      metadata: { proposalId: proposal?.id, repairPlan: enhancedPlan }
    });

    return { created: true, status: "pending", proposal, preview, candidate };
  }

  static async list(options: { user: any; status?: string | null }) {
    requireReviewer(options.user);
    await this.ensureTable();

    return withTransaction(async (client: any) => {
      const result = await client.query(
        `
          select
            crp.*,
            c.display_name as contact_display_name,
            c.primary_phone_normalized,
            c.primary_phone_e164
          from contact_repair_proposals crp
          join contacts c on c.id = crp.contact_id
          where crp.organization_id = $1
            and ($2::text is null or crp.status = $2)
          order by crp.detected_at desc
          limit 100
        `,
        [options.user.organizationId, options.status ?? null]
      );

      return result.rows;
    });
  }

  static async approveAndApply(proposalId: string, options: { user: any; note?: string | null }) {
    requireReviewer(options.user);
    await this.ensureTable();

    let proposal: any = null;
    let appliedPhoneRepair: any = null;
    let appliedDuplicateMerge: any = null;

    await withTransaction(async (client: any) => {
      const result = await client.query(
        `
          select *
          from contact_repair_proposals
          where id = $1
            and organization_id = $2
            and status = 'pending'
          for update
        `,
        [proposalId, options.user.organizationId]
      );
      proposal = result.rows[0] ?? null;

      if (!proposal) {
        throw new Error("Pending repair proposal not found");
      }

      const repairPlan = proposal.repair_plan ?? {};
      const candidatePhone =
        typeof repairPlan.candidate_phone === "string" && repairPlan.candidate_phone.trim()
          ? repairPlan.candidate_phone.trim()
          : null;
      const candidatePhoneE164 =
        typeof repairPlan.candidate_phone_e164 === "string" && repairPlan.candidate_phone_e164.trim()
          ? repairPlan.candidate_phone_e164.trim()
          : normalizeE164FromPhone(candidatePhone);

      if (candidatePhone) {
        const phoneResult = await client.query(
          `
            update contacts
            set primary_phone_normalized = coalesce(primary_phone_normalized, $1),
                primary_phone_e164 = coalesce(primary_phone_e164, $2),
                updated_at = timezone('utc', now())
            where id = $3
              and organization_id = $4
            returning id, primary_phone_normalized, primary_phone_e164
          `,
          [candidatePhone, candidatePhoneE164, proposal.contact_id, options.user.organizationId]
        );

        appliedPhoneRepair = phoneResult.rows[0] ?? null;
      }

      if (repairPlan.issue_type === "duplicate_contact" && repairPlan.duplicate_contact) {
        const sourceContactId =
          typeof repairPlan.duplicate_contact.source_contact_id === "string"
            ? repairPlan.duplicate_contact.source_contact_id
            : null;

        const targetContactId =
          typeof repairPlan.duplicate_contact.target_contact_id === "string"
            ? repairPlan.duplicate_contact.target_contact_id
            : null;

        if (!sourceContactId || !targetContactId) {
          throw new Error("Duplicate merge proposal is missing source or target contact");
        }

        appliedDuplicateMerge = await applyDuplicateContactMerge(client, {
          organizationId: options.user.organizationId,
          sourceContactId,
          targetContactId,
          mergedBy: options.user.organizationUserId ?? null
        });
      }

      await client.query(
        `
          update contact_repair_proposals
          set status = 'applied',
              reviewed_at = timezone('utc', now()),
              reviewed_by = $3,
              review_note = $4,
              updated_at = timezone('utc', now())
          where id = $1
            and organization_id = $2
        `,
        [proposalId, options.user.organizationId, options.user.organizationUserId ?? null, options.note ?? null]
      );
    });

    const refreshContactId =
      appliedDuplicateMerge?.targetContactId ?? proposal.contact_id;

    const applied = await ContactIdentityRepairService.refreshContactIdentity(refreshContactId, {
      dry_run: false,
      confirm: true,
      user: options.user
    });

    await new AuditLogService().record(options.user, {
      action: "contact.repair_proposal.applied",
      entityType: "contact",
      entityId: refreshContactId,
      metadata: { proposalId, applied, appliedPhoneRepair, appliedDuplicateMerge }
    });

    return {
      proposalId,
      status: "applied",
      applied,
      appliedPhoneRepair,
      appliedDuplicateMerge
    };
  }

  static async mergeContactsManually(input: {
    sourceContactId: string;
    targetContactId: string;
    user: any;
    note?: string | null;
  }) {
    if (!input.user?.organizationId) {
      throw new Error("organization_id is required");
    }

    let appliedDuplicateMerge: any = null;

    await withTransaction(async (client: any) => {
      appliedDuplicateMerge = await applyDuplicateContactMerge(client, {
        organizationId: input.user.organizationId,
        sourceContactId: input.sourceContactId,
        targetContactId: input.targetContactId,
        mergedBy: input.user.organizationUserId ?? null
      });
    });

    const applied = await ContactIdentityRepairService.refreshContactIdentity(input.targetContactId, {
      dry_run: false,
      confirm: true,
      user: input.user
    });

    await new AuditLogService().record(input.user, {
      action: "contact.manual_merge.applied",
      entityType: "contact",
      entityId: input.targetContactId,
      metadata: {
        sourceContactId: input.sourceContactId,
        targetContactId: input.targetContactId,
        note: input.note ?? null,
        applied,
        appliedDuplicateMerge
      }
    });

    return {
      status: "applied",
      sourceContactId: input.sourceContactId,
      targetContactId: input.targetContactId,
      applied,
      appliedDuplicateMerge
    };
  }

  static async reject(proposalId: string, options: { user: any; note?: string | null }) {
    requireReviewer(options.user);
    await this.ensureTable();

    let proposal: any = null;
    await withTransaction(async (client: any) => {
      const result = await client.query(
        `
          update contact_repair_proposals
          set status = 'rejected',
              reviewed_at = timezone('utc', now()),
              reviewed_by = $3,
              review_note = $4,
              updated_at = timezone('utc', now())
          where id = $1
            and organization_id = $2
            and status = 'pending'
          returning *
        `,
        [proposalId, options.user.organizationId, options.user.organizationUserId ?? null, options.note ?? null]
      );
      proposal = result.rows[0] ?? null;
    });

    if (!proposal) {
      throw new Error("Pending repair proposal not found");
    }

    await new AuditLogService().record(options.user, {
      action: "contact.repair_proposal.rejected",
      entityType: "contact",
      entityId: proposal.contact_id,
      metadata: { proposalId, note: options.note ?? null }
    });

    return { proposalId, status: "rejected" };
  }
}
