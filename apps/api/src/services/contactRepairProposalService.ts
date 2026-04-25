import { withTransaction } from "../config/database.js";
import { AuditLogService } from "./auditLogService.js";
import { ContactIdentityRepairService } from "./contactIdentityRepairService.js";

function requireReviewer(user: any) {
  if (!user || (user.role !== "org_admin" && user.role !== "super_admin")) {
    throw new Error("Insufficient permissions: org_admin or super_admin required");
  }
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

    const plan = preview.repairPlan ?? {};
    const shouldPropose = Boolean(plan.currentNameIsBlocked || (plan.poisonedIdentityCount ?? 0) > 0);

    if (!shouldPropose) {
      return { created: false, status: "clean", preview };
    }

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
          "Contact name or identity matches a connected WhatsApp account label/display name.",
          plan.currentNameIsBlocked ? "high" : "medium",
          "clear_poisoned_identity_and_wrong_contact_name",
          preview.before ?? {},
          preview.after ?? {},
          plan
        ]
      );

      proposal = result.rows[0];
    });

    await new AuditLogService().record(options.user, {
      action: "contact.repair_proposal.detected",
      entityType: "contact",
      entityId: contactId,
      metadata: { proposalId: proposal?.id, repairPlan: plan }
    });

    return { created: true, status: "pending", proposal, preview };
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

    const applied = await ContactIdentityRepairService.refreshContactIdentity(proposal.contact_id, {
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
      entityId: proposal.contact_id,
      metadata: { proposalId, applied }
    });

    return { proposalId, status: "applied", applied };
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
