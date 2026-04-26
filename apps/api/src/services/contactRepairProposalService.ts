import { withTransaction } from "../config/database.js";
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

async function applyDuplicateContactMerge(
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

  const movedCounts: Record<string, number> = {};

  const conversations = await client.query(
    `
      update conversations
      set contact_id = $1,
          updated_at = timezone('utc', now())
      where contact_id = $2
      returning id
    `,
    [input.targetContactId, input.sourceContactId]
  );
  movedCounts.conversations = conversations.rowCount ?? 0;

  const messages = await client.query(
    `
      update messages
      set contact_id = $1
      where contact_id = $2
      returning id
    `,
    [input.targetContactId, input.sourceContactId]
  );
  movedCounts.messages = messages.rowCount ?? 0;

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

  return {
    sourceContact: source.rows[0] ?? null,
    targetContactId: input.targetContactId,
    movedCounts
  };
}

export class ContactRepairProposalService {
  static async ensureTable() {
    await withTransaction(async (client: any) => {
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
    await withTransaction(async (client: any) => {
      const result = await client.query(
        `
          update contact_repair_proposals
          set status = 'approved',
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

    const repairPlan = proposal.repair_plan ?? {};
    const candidatePhone =
      typeof repairPlan.candidate_phone === "string" && repairPlan.candidate_phone.trim()
        ? repairPlan.candidate_phone.trim()
        : null;
    const candidatePhoneE164 =
      typeof repairPlan.candidate_phone_e164 === "string" && repairPlan.candidate_phone_e164.trim()
        ? repairPlan.candidate_phone_e164.trim()
        : normalizeE164FromPhone(candidatePhone);

    let appliedPhoneRepair: any = null;

    if (candidatePhone) {
      await withTransaction(async (client: any) => {
        const result = await client.query(
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

        appliedPhoneRepair = result.rows[0] ?? null;
      });
    }

    let appliedDuplicateMerge: any = null;

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

      await withTransaction(async (client: any) => {
        appliedDuplicateMerge = await applyDuplicateContactMerge(client, {
          organizationId: options.user.organizationId,
          sourceContactId,
          targetContactId,
          mergedBy: options.user.organizationUserId ?? null
        });
      });
    }

    const refreshContactId =
      appliedDuplicateMerge?.targetContactId ?? proposal.contact_id;

    const applied = await ContactIdentityRepairService.refreshContactIdentity(refreshContactId, {
      dry_run: false,
      confirm: true,
      user: options.user
    });

    await withTransaction(async (client: any) => {
      await client.query(
        `
          update contact_repair_proposals
          set status = 'applied',
              updated_at = timezone('utc', now())
          where id = $1
            and organization_id = $2
        `,
        [proposalId, options.user.organizationId]
      );
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