import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import { AuditLogService } from "./auditLogService.js";

type TemplateType = "campaign_message" | "quick_reply" | "email_placeholder";
type TemplateStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";

type TemplateSnapshot = {
  title: string;
  body: string;
  variables?: string[];
  variable_defaults?: Record<string, string>;
  variable_definitions?: unknown[];
  category?: string | null;
  description?: string | null;
};

const STATUSES = new Set(["draft", "pending_review", "approved", "rejected", "archived"]);
const TEMPLATE_TYPES = new Set(["campaign_message", "quick_reply", "email_placeholder"]);

function clampLimit(value?: number | null) {
  return Math.max(1, Math.min(200, Math.trunc(value ?? 50)));
}

function normalizeStatus(value: string | null | undefined): TemplateStatus | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return STATUSES.has(lower) ? (lower as TemplateStatus) : null;
}

function normalizeTemplateType(value: string | null | undefined): TemplateType {
  if (!value || !TEMPLATE_TYPES.has(value)) {
    throw new AppError("template_type is required", 400, "template_type_required");
  }
  return value as TemplateType;
}

function extractVariables(body: string) {
  const keys = new Set<string>();
  const matches = body.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
  for (const match of matches) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }
  return [...keys];
}

function canApprove(user: AuthUser) {
  return user.role === "super_admin" || user.role === "org_admin" || user.permissionKeys.includes("templates.approve");
}

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

export class TemplateGovernanceService {
  constructor(private readonly auditLogService = new AuditLogService()) {}

  static async ensureTables(client: PoolClient) {
    await client.query(`
      create table if not exists template_governance_settings (
        organization_id uuid primary key references organizations(id) on delete cascade,
        approval_required boolean not null default false,
        allow_agent_custom_templates boolean not null default false,
        auto_approve_org_admin_templates boolean not null default true,
        lock_approved_templates boolean not null default true,
        updated_by_user_id uuid references organization_users(id) on delete set null,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query(`
      create table if not exists template_governance_templates (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        template_type text not null,
        source_template_id uuid null,
        title text not null,
        category text,
        current_status text not null default 'draft',
        active_version_id uuid null,
        created_by_user_id uuid references organization_users(id) on delete set null,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now()),
        archived_at timestamptz,
        unique (organization_id, template_type, source_template_id)
      )
    `);
    await client.query(`
      create table if not exists template_versions (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        template_type text not null,
        template_id uuid not null references template_governance_templates(id) on delete cascade,
        version_number integer not null,
        snapshot jsonb not null,
        status text not null default 'draft',
        is_active boolean not null default false,
        change_summary text,
        created_by_user_id uuid references organization_users(id) on delete set null,
        created_at timestamptz not null default timezone('utc', now()),
        unique (organization_id, template_type, template_id, version_number)
      )
    `);
    await client.query(`
      create table if not exists template_approvals (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        template_type text not null,
        template_id uuid not null references template_governance_templates(id) on delete cascade,
        version_id uuid not null references template_versions(id) on delete cascade,
        requested_by_user_id uuid references organization_users(id) on delete set null,
        reviewed_by_user_id uuid references organization_users(id) on delete set null,
        status text not null,
        review_note text,
        requested_at timestamptz not null default timezone('utc', now()),
        reviewed_at timestamptz
      )
    `);
  }

  static async recordQuickReplyVersion(client: PoolClient, input: {
    organizationId: string;
    sourceTemplateId: string;
    title: string;
    body: string;
    category?: string | null;
    variableDefinitions?: unknown[];
    isActive: boolean;
    userId?: string | null;
    changeSummary?: string | null;
  }) {
    await this.ensureTables(client);
    const settings = await getSettingsOnClient(client, input.organizationId);
    const status: TemplateStatus = input.isActive && (!settings.approval_required || settings.auto_approve_org_admin_templates) ? "approved" : input.isActive ? "pending_review" : "archived";
    const template = await upsertGovernanceTemplate(client, {
      organizationId: input.organizationId,
      templateType: "quick_reply",
      sourceTemplateId: input.sourceTemplateId,
      title: input.title,
      category: input.category ?? null,
      status,
      userId: input.userId ?? null
    });
    const version = await createVersionOnClient(client, {
      organizationId: input.organizationId,
      templateType: "quick_reply",
      templateId: template.id,
      snapshot: {
        title: input.title,
        body: input.body,
        category: input.category ?? null,
        variables: extractVariables(input.body),
        variable_definitions: input.variableDefinitions ?? []
      },
      status,
      changeSummary: input.changeSummary ?? "Quick reply changed",
      userId: input.userId ?? null
    });
    if (status === "approved") {
      await activateVersion(client, input.organizationId, template.id, version.id);
    }
    return version;
  }

  static async filterAllowedQuickReplies<T extends { id: string; organization_id: string; is_active: boolean }>(
    client: PoolClient,
    organizationId: string,
    templates: T[]
  ) {
    await this.ensureTables(client);
    const settings = await getSettingsOnClient(client, organizationId);
    if (!settings.approval_required) return templates;
    await syncQuickReplyTemplates(client, organizationId);
    const approved = await client.query<{ source_template_id: string }>(
      `
        select tgt.source_template_id
        from template_governance_templates tgt
        join template_versions tv on tv.id = tgt.active_version_id
        where tgt.organization_id = $1
          and tgt.template_type = 'quick_reply'
          and tgt.current_status = 'approved'
          and tv.status = 'approved'
      `,
      [organizationId]
    );
    const approvedIds = new Set(approved.rows.map((row) => row.source_template_id));
    return templates.filter((template) => template.is_active && approvedIds.has(template.id));
  }

  async getSettings(user: AuthUser, input?: { organizationId?: string | null }) {
    const organizationId = resolveOrganizationId(user, input?.organizationId);
    return withClient(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      return getSettingsOnClient(client, organizationId);
    });
  }

  async updateSettings(user: AuthUser, input: {
    organizationId?: string | null;
    approval_required?: boolean;
    allow_agent_custom_templates?: boolean;
    auto_approve_org_admin_templates?: boolean;
    lock_approved_templates?: boolean;
  }) {
    if (!canApprove(user)) throw new AppError("Insufficient permissions", 403, "template_approval_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const settings = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const result = await client.query(
        `
          insert into template_governance_settings (
            organization_id,
            approval_required,
            allow_agent_custom_templates,
            auto_approve_org_admin_templates,
            lock_approved_templates,
            updated_by_user_id
          ) values ($1, coalesce($2, false), coalesce($3, false), coalesce($4, true), coalesce($5, true), $6)
          on conflict (organization_id)
          do update set
            approval_required = coalesce($2, template_governance_settings.approval_required),
            allow_agent_custom_templates = coalesce($3, template_governance_settings.allow_agent_custom_templates),
            auto_approve_org_admin_templates = coalesce($4, template_governance_settings.auto_approve_org_admin_templates),
            lock_approved_templates = coalesce($5, template_governance_settings.lock_approved_templates),
            updated_by_user_id = $6,
            updated_at = timezone('utc', now())
          returning *
        `,
        [
          organizationId,
          input.approval_required ?? null,
          input.allow_agent_custom_templates ?? null,
          input.auto_approve_org_admin_templates ?? null,
          input.lock_approved_templates ?? null,
          user.organizationUserId
        ]
      );
      return result.rows[0];
    });
    await this.auditLogService.record(user, {
      organizationId,
      action: "template.settings_updated",
      entityType: "template_governance_settings",
      entityId: organizationId,
      metadata: settings
    });
    return settings;
  }

  async listTemplates(user: AuthUser, input: {
    organizationId?: string | null;
    templateType?: string | null;
    status?: string | null;
    search?: string | null;
    limit?: number;
    offset?: number;
  }) {
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const templateType = input.templateType ? normalizeTemplateType(input.templateType) : null;
    const status = normalizeStatus(input.status);
    return withClient(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      await syncQuickReplyTemplates(client, organizationId);
      const values: unknown[] = [organizationId];
      const filters = ["tgt.organization_id = $1"];
      if (templateType) {
        values.push(templateType);
        filters.push(`tgt.template_type = $${values.length}`);
      }
      if (status) {
        values.push(status);
        filters.push(`tgt.current_status = $${values.length}`);
      }
      if (input.search?.trim()) {
        values.push(`%${input.search.trim()}%`);
        filters.push(`(tgt.title ilike $${values.length} or tgt.category ilike $${values.length})`);
      }
      values.push(clampLimit(input.limit), Math.max(0, input.offset ?? 0));
      const result = await client.query(
        `
          select
            tgt.id as template_id,
            tgt.template_type,
            tgt.source_template_id,
            tgt.title,
            tgt.category,
            tgt.current_status,
            tgt.active_version_id,
            active.version_number as active_version_number,
            active.snapshot as active_snapshot,
            active.snapshot->>'body' as active_body,
            latest.version_number as latest_version_number,
            tgt.updated_at as last_updated_at,
            active.created_at as last_approved_at,
            tgt.created_by_user_id as created_by,
            approval.reviewed_by_user_id as approved_by,
            coalesce(qrt.usage_count, 0)::integer as usage_count,
            coalesce(qrme.send_count, 0)::integer as send_count,
            coalesce(qrme.response_rate, 0)::numeric as response_rate
          from template_governance_templates tgt
          left join template_versions active on active.id = tgt.active_version_id
          left join lateral (
            select version_number
            from template_versions tv
            where tv.organization_id = tgt.organization_id and tv.template_id = tgt.id
            order by version_number desc
            limit 1
          ) latest on true
          left join lateral (
            select reviewed_by_user_id
            from template_approvals ta
            where ta.organization_id = tgt.organization_id and ta.version_id = tgt.active_version_id and ta.status = 'approved'
            order by reviewed_at desc nulls last, requested_at desc
            limit 1
          ) approval on true
          left join quick_reply_templates qrt on qrt.id = tgt.source_template_id and tgt.template_type = 'quick_reply'
          left join lateral (
            select
              count(*)::integer as send_count,
              case when count(*) = 0 then 0 else round((count(*) filter (where outcome_status <> 'sent')::numeric / count(*)::numeric) * 100, 2) end as response_rate
            from quick_reply_message_events qrme
            where qrme.organization_id = tgt.organization_id and qrme.quick_reply_template_id = tgt.source_template_id
          ) qrme on true
          where ${filters.join(" and ")}
          order by tgt.updated_at desc
          limit $${values.length - 1}
          offset $${values.length}
        `,
        values
      );
      return result.rows;
    });
  }

  async createTemplate(user: AuthUser, input: {
    organizationId?: string | null;
    templateType: string;
    title: string;
    body: string;
    variables?: string[];
    variable_defaults?: Record<string, string>;
    category?: string | null;
    change_summary?: string | null;
  }) {
    if (!canManage(user)) throw new AppError("Insufficient permissions", 403, "template_write_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const templateType = normalizeTemplateType(input.templateType);
    const result = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const settings = await getSettingsOnClient(client, organizationId);
      const status: TemplateStatus = settings.approval_required && !settings.auto_approve_org_admin_templates ? "draft" : "approved";
      const template = await upsertGovernanceTemplate(client, {
        organizationId,
        templateType,
        title: input.title,
        category: input.category ?? null,
        status,
        userId: user.organizationUserId
      });
      const version = await createVersionOnClient(client, {
        organizationId,
        templateType,
        templateId: template.id,
        snapshot: {
          title: input.title,
          body: input.body,
          variables: input.variables ?? extractVariables(input.body),
          variable_defaults: input.variable_defaults ?? {},
          category: input.category ?? null
        },
        status,
        changeSummary: input.change_summary ?? "Initial version",
        userId: user.organizationUserId
      });
      if (status === "approved") await activateVersion(client, organizationId, template.id, version.id);
      return { template, version };
    });
    await this.recordTemplateAudit(user, organizationId, "template.version_created", result.template.id, result.version);
    return result;
  }

  async listVersions(user: AuthUser, input: { organizationId?: string | null; templateId: string; templateType?: string | null }) {
    const organizationId = resolveOrganizationId(user, input.organizationId);
    return withClient(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      await assertTemplate(client, organizationId, input.templateId, input.templateType ?? null);
      const result = await client.query(
        `
          select
            tv.id as version_id,
            tv.version_number,
            tv.status,
            tv.snapshot->>'title' as title,
            left(tv.snapshot->>'body', 180) as body_preview,
            coalesce(tv.snapshot->'variables', '[]'::jsonb) as variables,
            tv.change_summary,
            tv.created_by_user_id as created_by,
            tv.created_at,
            coalesce(ta.status, tv.status) as approval_status,
            ta.reviewed_by_user_id as reviewed_by,
            ta.reviewed_at,
            ta.review_note
          from template_versions tv
          left join lateral (
            select *
            from template_approvals ta
            where ta.organization_id = tv.organization_id and ta.version_id = tv.id
            order by ta.requested_at desc
            limit 1
          ) ta on true
          where tv.organization_id = $1 and tv.template_id = $2
          order by tv.version_number desc
        `,
        [organizationId, input.templateId]
      );
      return result.rows;
    });
  }

  async getVersion(user: AuthUser, input: { organizationId?: string | null; templateId: string; versionId: string }) {
    const organizationId = resolveOrganizationId(user, input.organizationId);
    return withClient(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const result = await client.query(
        `
          select tv.*, ta.status as approval_status, ta.reviewed_by_user_id as reviewed_by, ta.reviewed_at, ta.review_note
          from template_versions tv
          left join lateral (
            select *
            from template_approvals ta
            where ta.organization_id = tv.organization_id and ta.version_id = tv.id
            order by ta.requested_at desc
            limit 1
          ) ta on true
          where tv.organization_id = $1 and tv.template_id = $2 and tv.id = $3
          limit 1
        `,
        [organizationId, input.templateId, input.versionId]
      );
      const row = result.rows[0];
      if (!row) throw new AppError("Template version not found", 404, "template_version_not_found");
      const snapshot = row.snapshot as TemplateSnapshot;
      return {
        ...row,
        rendered_preview: renderPreview(snapshot)
      };
    });
  }

  async getDiff(user: AuthUser, input: { organizationId?: string | null; templateId: string; versionId: string; compareToVersionId: string }) {
    const organizationId = resolveOrganizationId(user, input.organizationId);
    return withClient(async (client) => {
      const versions = await client.query(
        `
          select id, version_number, snapshot, status, change_summary
          from template_versions
          where organization_id = $1 and template_id = $2 and id in ($3, $4)
        `,
        [organizationId, input.templateId, input.versionId, input.compareToVersionId]
      );
      const current = versions.rows.find((row) => row.id === input.versionId);
      const previous = versions.rows.find((row) => row.id === input.compareToVersionId);
      if (!current || !previous) throw new AppError("Template versions not found", 404, "template_version_not_found");
      return diffSnapshots(previous, current);
    });
  }

  async createVersion(user: AuthUser, input: {
    organizationId?: string | null;
    templateId: string;
    templateType: string;
    title: string;
    body: string;
    variables?: string[];
    variable_defaults?: Record<string, string>;
    category?: string | null;
    change_summary?: string | null;
  }) {
    if (!canManage(user)) throw new AppError("Insufficient permissions", 403, "template_write_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const templateType = normalizeTemplateType(input.templateType);
    const version = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      await assertTemplate(client, organizationId, input.templateId, templateType);
      const settings = await getSettingsOnClient(client, organizationId);
      const status: TemplateStatus = settings.approval_required ? "draft" : "approved";
      const created = await createVersionOnClient(client, {
        organizationId,
        templateType,
        templateId: input.templateId,
        snapshot: {
          title: input.title,
          body: input.body,
          variables: input.variables ?? extractVariables(input.body),
          variable_defaults: input.variable_defaults ?? {},
          category: input.category ?? null
        },
        status,
        changeSummary: input.change_summary ?? null,
        userId: user.organizationUserId
      });
      await client.query(`update template_governance_templates set title = $3, category = $4, current_status = $5 where organization_id = $1 and id = $2`, [
        organizationId,
        input.templateId,
        input.title,
        input.category ?? null,
        status
      ]);
      if (status === "approved") await activateVersion(client, organizationId, input.templateId, created.id);
      return created;
    });
    await this.recordTemplateAudit(user, organizationId, "template.version_created", input.templateId, version);
    return version;
  }

  async submitReview(user: AuthUser, input: { organizationId?: string | null; templateId: string; versionId: string }) {
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const version = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const existing = await getVersionOnClient(client, organizationId, input.templateId, input.versionId, true);
      if (!["draft", "rejected"].includes(existing.status)) {
        throw new AppError("Only draft or rejected versions can be submitted", 409, "template_not_submittable");
      }
      await client.query(`update template_versions set status = 'pending_review' where organization_id = $1 and id = $2`, [organizationId, input.versionId]);
      await client.query(`update template_governance_templates set current_status = 'pending_review' where organization_id = $1 and id = $2`, [organizationId, input.templateId]);
      await client.query(
        `
          insert into template_approvals (organization_id, template_type, template_id, version_id, requested_by_user_id, status)
          values ($1, $2, $3, $4, $5, 'pending_review')
        `,
        [organizationId, existing.template_type, input.templateId, input.versionId, user.organizationUserId]
      );
      return { ...existing, status: "pending_review" };
    });
    await this.recordTemplateAudit(user, organizationId, "template.submitted_for_review", input.templateId, version);
    return version;
  }

  async approve(user: AuthUser, input: { organizationId?: string | null; templateId: string; versionId: string; note?: string | null }) {
    if (!canApprove(user)) throw new AppError("Insufficient permissions", 403, "template_approval_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const version = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const existing = await getVersionOnClient(client, organizationId, input.templateId, input.versionId, true);
      await client.query(`update template_versions set status = 'approved' where organization_id = $1 and id = $2`, [organizationId, input.versionId]);
      await activateVersion(client, organizationId, input.templateId, input.versionId);
      await applyApprovedSnapshotToSourceTemplate(client, organizationId, input.templateId, existing.snapshot as TemplateSnapshot);
      await client.query(
        `
          update template_approvals
          set status = 'approved', reviewed_by_user_id = $4, review_note = $5, reviewed_at = timezone('utc', now())
          where organization_id = $1 and version_id = $2 and status = 'pending_review'
        `,
        [organizationId, input.versionId, input.templateId, user.organizationUserId, input.note ?? null]
      );
      return { ...existing, status: "approved" };
    });
    await this.recordTemplateAudit(user, organizationId, "template.approved", input.templateId, version, input.note);
    return version;
  }

  async reject(user: AuthUser, input: { organizationId?: string | null; templateId: string; versionId: string; note: string }) {
    if (!canApprove(user)) throw new AppError("Insufficient permissions", 403, "template_approval_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const version = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const existing = await getVersionOnClient(client, organizationId, input.templateId, input.versionId, true);
      await client.query(`update template_versions set status = 'rejected' where organization_id = $1 and id = $2`, [organizationId, input.versionId]);
      await client.query(`update template_governance_templates set current_status = 'rejected' where organization_id = $1 and id = $2 and active_version_id is null`, [organizationId, input.templateId]);
      await client.query(
        `
          update template_approvals
          set status = 'rejected', reviewed_by_user_id = $3, review_note = $4, reviewed_at = timezone('utc', now())
          where organization_id = $1 and version_id = $2 and status = 'pending_review'
        `,
        [organizationId, input.versionId, user.organizationUserId, input.note]
      );
      return { ...existing, status: "rejected" };
    });
    await this.recordTemplateAudit(user, organizationId, "template.rejected", input.templateId, version, input.note);
    return version;
  }

  async rollback(user: AuthUser, input: { organizationId?: string | null; templateId: string; versionId: string; change_summary?: string | null; submit_for_review?: boolean }) {
    if (!canManage(user)) throw new AppError("Insufficient permissions", 403, "template_write_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const version = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const source = await getVersionOnClient(client, organizationId, input.templateId, input.versionId, true);
      const status: TemplateStatus = input.submit_for_review ? "pending_review" : "draft";
      const created = await createVersionOnClient(client, {
        organizationId,
        templateType: source.template_type,
        templateId: input.templateId,
        snapshot: source.snapshot,
        status,
        changeSummary: input.change_summary ?? `Rollback from version ${source.version_number}`,
        userId: user.organizationUserId
      });
      await client.query(`update template_governance_templates set current_status = $3 where organization_id = $1 and id = $2`, [organizationId, input.templateId, status]);
      if (status === "pending_review") {
        await client.query(
          `insert into template_approvals (organization_id, template_type, template_id, version_id, requested_by_user_id, status) values ($1, $2, $3, $4, $5, 'pending_review')`,
          [organizationId, source.template_type, input.templateId, created.id, user.organizationUserId]
        );
      }
      return created;
    });
    await this.recordTemplateAudit(user, organizationId, "template.rollback_created", input.templateId, version, input.change_summary ?? null);
    return version;
  }

  async archive(user: AuthUser, input: { organizationId?: string | null; templateId: string }) {
    if (!canManage(user)) throw new AppError("Insufficient permissions", 403, "template_write_forbidden");
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const result = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const template = await assertTemplate(client, organizationId, input.templateId, null);
      await client.query(`update template_governance_templates set current_status = 'archived', archived_at = timezone('utc', now()) where organization_id = $1 and id = $2`, [organizationId, input.templateId]);
      await client.query(`update template_versions set status = 'archived', is_active = false where organization_id = $1 and template_id = $2 and is_active`, [organizationId, input.templateId]);
      if (template.template_type === "quick_reply" && template.source_template_id) {
        await client.query(`update quick_reply_templates set is_active = false, updated_at = timezone('utc', now()) where organization_id = $1 and id = $2`, [
          organizationId,
          template.source_template_id
        ]);
      }
      return template;
    });
    await this.auditLogService.record(user, {
      organizationId,
      action: "template.archived",
      entityType: "template",
      entityId: input.templateId,
      metadata: result
    });
    return result;
  }

  async assertTemplateCanBeUsedInCampaign(input: {
    organizationId: string;
    templateGovernanceVersionId?: string | null;
    messageTemplate?: string | null;
  }) {
    return withClient(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      const settings = await getSettingsOnClient(client, input.organizationId);
      if (!settings.approval_required && !input.templateGovernanceVersionId) {
        return { body: input.messageTemplate ?? "", version: null };
      }
      if (!input.templateGovernanceVersionId) {
        throw new AppError("Template is not approved for campaign use.", 403, "template_not_approved");
      }
      const result = await client.query(
        `
          select tv.*, tgt.current_status
          from template_versions tv
          join template_governance_templates tgt on tgt.id = tv.template_id
          where tv.organization_id = $1
            and tv.id = $2
            and tv.template_type = 'campaign_message'
          limit 1
        `,
        [input.organizationId, input.templateGovernanceVersionId]
      );
      const version = result.rows[0];
      if (!version || version.status !== "approved" || version.current_status !== "approved") {
        throw new AppError("Template is not approved for campaign use.", 403, "template_not_approved");
      }
      return { body: (version.snapshot as TemplateSnapshot).body, version };
    });
  }

  private async recordTemplateAudit(user: AuthUser, organizationId: string, action: string, templateId: string, version: any, note?: string | null) {
    await this.auditLogService.record(user, {
      organizationId,
      action,
      entityType: "template",
      entityId: templateId,
      metadata: {
        template_id: templateId,
        template_type: version.template_type,
        version_id: version.id,
        version_number: version.version_number,
        previous_status: null,
        new_status: version.status,
        note: note ?? null,
        change_summary: version.change_summary ?? null
      }
    });
  }
}

async function applyApprovedSnapshotToSourceTemplate(client: PoolClient, organizationId: string, templateId: string, snapshot: TemplateSnapshot) {
  const template = await assertTemplate(client, organizationId, templateId, null);
  if (template.template_type !== "quick_reply" || !template.source_template_id) {
    return;
  }

  await client.query(
    `
      update quick_reply_templates
      set title = $3,
          body = $4,
          category = $5,
          variable_definitions = $6::jsonb,
          is_active = true,
          updated_at = timezone('utc', now())
      where organization_id = $1
        and id = $2
    `,
    [
      organizationId,
      template.source_template_id,
      snapshot.title,
      snapshot.body,
      snapshot.category ?? null,
      JSON.stringify(snapshot.variable_definitions ?? [])
    ]
  );
}

async function getSettingsOnClient(client: PoolClient, organizationId: string) {
  const result = await client.query(
    `
      insert into template_governance_settings (organization_id)
      values ($1)
      on conflict (organization_id) do nothing
      returning *
    `,
    [organizationId]
  );
  if (result.rows[0]) return result.rows[0];
  const existing = await client.query(`select * from template_governance_settings where organization_id = $1`, [organizationId]);
  return existing.rows[0] ?? {
    organization_id: organizationId,
    approval_required: false,
    allow_agent_custom_templates: false,
    auto_approve_org_admin_templates: true,
    lock_approved_templates: true
  };
}

async function syncQuickReplyTemplates(client: PoolClient, organizationId: string) {
  const rows = await client.query(
    `
      select qrt.*
      from quick_reply_templates qrt
      left join template_governance_templates tgt
        on tgt.organization_id = qrt.organization_id
       and tgt.template_type = 'quick_reply'
       and tgt.source_template_id = qrt.id
      where qrt.organization_id = $1
        and tgt.id is null
    `,
    [organizationId]
  );
  for (const row of rows.rows) {
    await TemplateGovernanceService.recordQuickReplyVersion(client, {
      organizationId,
      sourceTemplateId: row.id,
      title: row.title,
      body: row.body,
      category: row.category,
      variableDefinitions: row.variable_definitions,
      isActive: row.is_active,
      userId: row.created_by,
      changeSummary: "Seeded from existing quick reply"
    });
  }
}

async function upsertGovernanceTemplate(client: PoolClient, input: {
  organizationId: string;
  templateType: TemplateType;
  sourceTemplateId?: string | null;
  title: string;
  category?: string | null;
  status: TemplateStatus;
  userId?: string | null;
}) {
  const result = await client.query(
    `
      insert into template_governance_templates (
        organization_id, template_type, source_template_id, title, category, current_status, created_by_user_id
      ) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (organization_id, template_type, source_template_id)
      do update set title = excluded.title, category = excluded.category, current_status = excluded.current_status, updated_at = timezone('utc', now())
      returning *
    `,
    [input.organizationId, input.templateType, input.sourceTemplateId ?? null, input.title, input.category ?? null, input.status, input.userId ?? null]
  );
  return result.rows[0];
}

async function createVersionOnClient(client: PoolClient, input: {
  organizationId: string;
  templateType: TemplateType;
  templateId: string;
  snapshot: TemplateSnapshot;
  status: TemplateStatus;
  changeSummary?: string | null;
  userId?: string | null;
}) {
  const versionResult = await client.query<{ next_version: number }>(
    `select coalesce(max(version_number), 0) + 1 as next_version from template_versions where organization_id = $1 and template_id = $2`,
    [input.organizationId, input.templateId]
  );
  const versionNumber = versionResult.rows[0]?.next_version ?? 1;
  const result = await client.query(
    `
      insert into template_versions (
        organization_id, template_type, template_id, version_number, snapshot, status, change_summary, created_by_user_id
      ) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      returning *
    `,
    [
      input.organizationId,
      input.templateType,
      input.templateId,
      versionNumber,
      JSON.stringify(input.snapshot),
      input.status,
      input.changeSummary ?? null,
      input.userId ?? null
    ]
  );
  return result.rows[0];
}

async function activateVersion(client: PoolClient, organizationId: string, templateId: string, versionId: string) {
  await client.query(`update template_versions set is_active = false where organization_id = $1 and template_id = $2`, [organizationId, templateId]);
  await client.query(`update template_versions set is_active = true, status = 'approved' where organization_id = $1 and id = $2`, [organizationId, versionId]);
  await client.query(`update template_governance_templates set active_version_id = $3, current_status = 'approved' where organization_id = $1 and id = $2`, [organizationId, templateId, versionId]);
}

async function assertTemplate(client: PoolClient, organizationId: string, templateId: string, templateType: string | null) {
  const values: unknown[] = [organizationId, templateId];
  const filters = ["organization_id = $1", "id = $2"];
  if (templateType) {
    values.push(templateType);
    filters.push(`template_type = $${values.length}`);
  }
  const result = await client.query(`select * from template_governance_templates where ${filters.join(" and ")} limit 1`, values);
  if (!result.rows[0]) throw new AppError("Template not found", 404, "template_not_found");
  return result.rows[0];
}

async function getVersionOnClient(client: PoolClient, organizationId: string, templateId: string, versionId: string, forUpdate = false) {
  const result = await client.query(
    `
      select *
      from template_versions
      where organization_id = $1 and template_id = $2 and id = $3
      ${forUpdate ? "for update" : ""}
    `,
    [organizationId, templateId, versionId]
  );
  if (!result.rows[0]) throw new AppError("Template version not found", 404, "template_version_not_found");
  return result.rows[0];
}

function renderPreview(snapshot: TemplateSnapshot) {
  const defaults = snapshot.variable_defaults ?? {};
  return snapshot.body.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => defaults[key] ?? `[${key}]`);
}

function diffSnapshots(previous: any, current: any) {
  const left = previous.snapshot as TemplateSnapshot;
  const right = current.snapshot as TemplateSnapshot;
  const fieldChanges = ["title", "category", "body"].flatMap((field) => {
    const before = (left as any)[field] ?? null;
    const after = (right as any)[field] ?? null;
    return before === after ? [] : [{ field, before, after }];
  });
  const beforeVariables = new Set(left.variables ?? extractVariables(left.body));
  const afterVariables = new Set(right.variables ?? extractVariables(right.body));
  return {
    field_changes: fieldChanges,
    body_diff: {
      before: left.body,
      after: right.body,
      changed: left.body !== right.body
    },
    variable_changes: {
      added: [...afterVariables].filter((key) => !beforeVariables.has(key)),
      removed: [...beforeVariables].filter((key) => !afterVariables.has(key))
    },
    metadata_changes: {
      from_version_number: previous.version_number,
      to_version_number: current.version_number,
      from_status: previous.status,
      to_status: current.status
    }
  };
}
