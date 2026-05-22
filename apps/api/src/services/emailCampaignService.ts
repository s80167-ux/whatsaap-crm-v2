import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import { query, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import { AuditLogService } from "./auditLogService.js";
import { EmailSenderService } from "./emailSenderService.js";

type EmailCampaignRow = {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  sender_id: string;
  audience_group_id: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "paused" | "failed" | "cancelled";
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type EmailCampaignRecipientRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  contact_id: string | null;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  status: "pending" | "skipped" | "sending" | "sent" | "failed" | "unsubscribed" | "bounced";
  failure_code: string | null;
  failure_reason: string | null;
  provider_message_id: string | null;
  unsubscribe_token_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
  total_count?: string;
};

type EmailCampaignSummaryRow = EmailCampaignRow & {
  sender_display_name: string | null;
  sender_from_email: string | null;
  total_recipients: string;
  pending_recipients: string;
  sent_recipients: string;
  failed_recipients: string;
  skipped_recipients: string;
  unsubscribed_recipients: string;
};

type SuppressionRow = {
  id: string;
  organization_id: string;
  email: string;
  reason: "unsubscribed" | "bounced" | "complaint" | "manual";
  source: string | null;
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  total_count?: string;
};

type SendHistoryRow = {
  id: string;
  organization_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
};

type RecipientCandidate = {
  email: string | null;
  name: string | null;
  contactId: string | null;
  company: string | null;
  phone: string | null;
};

function ensureReadAccess(user: AuthUser) {
  if (["super_admin", "org_admin", "manager"].includes(user.role)) {
    return;
  }

  throw new AppError("Insufficient permissions", 403, "email_campaign_forbidden");
}

function ensureCampaignWriteAccess(user: AuthUser) {
  if (user.role === "super_admin" || user.role === "org_admin") {
    return;
  }

  if (user.role === "manager" && (user.permissionKeys.includes("messages.send") || user.permissionKeys.includes("org.manage_settings"))) {
    return;
  }

  throw new AppError("Insufficient permissions", 403, "email_campaign_write_forbidden");
}

function resolveOrganizationId(user: AuthUser, organizationId?: string | null) {
  if (user.role === "super_admin") {
    const resolved = organizationId ?? user.organizationId;

    if (!resolved) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    return resolved;
  }

  if (!user.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  if (organizationId && organizationId !== user.organizationId) {
    throw new AppError("Organization scope mismatch", 403, "organization_scope_mismatch");
  }

  return user.organizationId;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeProviderError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unable to send email.";
}

function buildUnsubscribeFooter(unsubscribeLink: string) {
  return `<p style="margin-top:24px;font-size:12px;color:#64748b">Unsubscribe: <a href="${unsubscribeLink}">${unsubscribeLink}</a></p>`;
}

function appendUnsubscribeFooter(bodyHtml: string, unsubscribeLink: string) {
  if (/unsubscribe/i.test(bodyHtml)) {
    return bodyHtml.replace(/\{\{\s*unsubscribe_link\s*\}\}/gi, unsubscribeLink);
  }

  return `${bodyHtml}${buildUnsubscribeFooter(unsubscribeLink)}`;
}

function firstNameFromName(name: string | null) {
  return name?.trim().split(/\s+/)[0] ?? "";
}

function renderMailMergeTemplate(value: string, recipient: Pick<EmailCampaignRecipientRow, "name" | "company" | "phone" | "email">) {
  const variables: Record<string, string> = {
    name: recipient.name ?? "",
    first_name: firstNameFromName(recipient.name),
    company: recipient.company ?? "",
    phone: recipient.phone ?? "",
    email: recipient.email
  };

  return value.replace(/\{\{\s*(name|first_name|company|phone|email)\s*\}\}/gi, (_match, key: string) => variables[key.toLowerCase()] ?? "");
}

function buildRecipientFailure(code: string, reason: string) {
  return {
    failureCode: code,
    failureReason: reason
  };
}

export class EmailCampaignService {
  constructor(
    private readonly senderService = new EmailSenderService(),
    private readonly auditLogService = new AuditLogService()
  ) {}

  async listSuppressionList(user: AuthUser, input: { organizationId?: string | null; search?: string; reason?: string; limit?: number; offset?: number }) {
    ensureReadAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const values: unknown[] = [organizationId];
    const filters = ["organization_id = $1"];

    if (input.search?.trim()) {
      values.push(`%${input.search.trim()}%`);
      filters.push(`email ilike $${values.length}`);
    }

    if (input.reason?.trim()) {
      values.push(input.reason.trim());
      filters.push(`reason = $${values.length}`);
    }

    values.push(limit, offset);

    const result = await query<SuppressionRow>(
      `
        select *, count(*) over()::text as total_count
        from email_suppression_list
        where ${filters.join(" and ")}
        order by created_at desc, email asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values
    );

    return {
      data: result.rows,
      pagination: {
        limit,
        offset,
        total: Number(result.rows[0]?.total_count ?? 0)
      }
    };
  }

  async addSuppression(user: AuthUser, input: { organizationId?: string | null; email: string; reason: "unsubscribed" | "bounced" | "complaint" | "manual"; note?: string | null; source?: string | null }, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const email = normalizeEmail(input.email);

    if (!isValidEmail(email)) {
      throw new AppError("email must be a valid email address", 400, "invalid_email_address");
    }

    const result = await withTransaction(async (client) => {
      await client.query(`delete from email_suppression_list where organization_id = $1 and lower(email) = lower($2)`, [organizationId, email]);
      const inserted = await client.query<SuppressionRow>(
        `
          insert into email_suppression_list (
            organization_id,
            email,
            reason,
            source,
            note,
            created_by_user_id
          ) values ($1, $2, $3, $4, $5, $6)
          returning *
        `,
        [organizationId, email, input.reason, input.source ?? null, input.note ?? null, user.organizationUserId]
      );

      return inserted.rows[0];
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_suppression.created",
      entityType: "email_suppression",
      entityId: result.id,
      metadata: {
        email,
        reason: input.reason,
        source: input.source ?? null
      },
      request
    });

    return result;
  }

  async removeSuppression(user: AuthUser, input: { organizationId?: string | null; suppressionId: string }, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const deleted = await query<SuppressionRow>(
      `
        delete from email_suppression_list
        where organization_id = $1
          and id = $2
        returning *
      `,
      [organizationId, input.suppressionId]
    );

    const row = deleted.rows[0];

    if (!row) {
      throw new AppError("Suppression entry not found", 404, "email_suppression_not_found");
    }

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_suppression.removed",
      entityType: "email_suppression",
      entityId: row.id,
      metadata: {
        email: row.email,
        reason: row.reason
      },
      request
    });

    return row;
  }

  async createCampaign(
    user: AuthUser,
    input: {
      organizationId?: string | null;
      name: string;
      senderId: string;
      subject: string;
      bodyHtml: string;
      bodyText?: string | null;
      audienceGroupId?: string | null;
      recipients?: Array<{ email: string; name?: string | null; contactId?: string | null }>;
    },
    request?: { ip?: string | null; userAgent?: string | null }
  ) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const sender = await this.senderService.getSenderForUse({ organizationId, senderId: input.senderId });
    const recipients = await this.collectRecipientCandidates(organizationId, input.audienceGroupId ?? null, input.recipients ?? []);
    const prepared = await this.prepareRecipients(organizationId, recipients);

    const campaign = await withTransaction(async (client) => {
      const inserted = await client.query<EmailCampaignRow>(
        `
          insert into email_campaigns (
            organization_id,
            name,
            subject,
            body_html,
            body_text,
            sender_id,
            audience_group_id,
            created_by_user_id
          ) values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning *
        `,
        [
          organizationId,
          input.name.trim(),
          input.subject.trim(),
          input.bodyHtml,
          input.bodyText?.trim() || stripHtml(input.bodyHtml),
          sender.id,
          input.audienceGroupId ?? null,
          user.organizationUserId
        ]
      );

      await this.insertRecipients(client, organizationId, inserted.rows[0].id, prepared);
      return inserted.rows[0];
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_campaign.created",
      entityType: "email_campaign",
      entityId: campaign.id,
      metadata: {
        sender_id: sender.id,
        from_email: sender.from_email,
        audience_group_id: input.audienceGroupId ?? null,
        recipient_counts: prepared.summary
      },
      request
    });

    return this.getCampaign(user, { organizationId, campaignId: campaign.id });
  }

  async listCampaigns(user: AuthUser, input?: { organizationId?: string | null }) {
    ensureReadAccess(user);
    const organizationId = resolveOrganizationId(user, input?.organizationId);
    const result = await query<EmailCampaignSummaryRow>(
      `
        select
          ec.*,
          es.display_name as sender_display_name,
          es.from_email as sender_from_email,
          count(ecr.id)::text as total_recipients,
          count(*) filter (where ecr.status = 'pending')::text as pending_recipients,
          count(*) filter (where ecr.status = 'sent')::text as sent_recipients,
          count(*) filter (where ecr.status = 'failed')::text as failed_recipients,
          count(*) filter (where ecr.status = 'skipped')::text as skipped_recipients,
          count(*) filter (where ecr.status = 'unsubscribed')::text as unsubscribed_recipients
        from email_campaigns ec
        join email_senders es on es.id = ec.sender_id
        left join email_campaign_recipients ecr on ecr.campaign_id = ec.id
        where ec.organization_id = $1
        group by ec.id, es.display_name, es.from_email
        order by ec.created_at desc, ec.name asc
      `,
      [organizationId]
    );

    return result.rows.map((row) => this.mapCampaignSummary(row));
  }

  async getCampaign(user: AuthUser, input: { organizationId?: string | null; campaignId: string }) {
    ensureReadAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const result = await query<EmailCampaignSummaryRow>(
      `
        select
          ec.*,
          es.display_name as sender_display_name,
          es.from_email as sender_from_email,
          count(ecr.id)::text as total_recipients,
          count(*) filter (where ecr.status = 'pending')::text as pending_recipients,
          count(*) filter (where ecr.status = 'sent')::text as sent_recipients,
          count(*) filter (where ecr.status = 'failed')::text as failed_recipients,
          count(*) filter (where ecr.status = 'skipped')::text as skipped_recipients,
          count(*) filter (where ecr.status = 'unsubscribed')::text as unsubscribed_recipients
        from email_campaigns ec
        join email_senders es on es.id = ec.sender_id
        left join email_campaign_recipients ecr on ecr.campaign_id = ec.id
        where ec.organization_id = $1
          and ec.id = $2
        group by ec.id, es.display_name, es.from_email
      `,
      [organizationId, input.campaignId]
    );

    const campaign = result.rows[0];

    if (!campaign) {
      throw new AppError("Email campaign not found", 404, "email_campaign_not_found");
    }

    return this.mapCampaignSummary(campaign);
  }

  async updateCampaign(
    user: AuthUser,
    input: {
      organizationId?: string | null;
      campaignId: string;
      name?: string;
      senderId?: string;
      subject?: string;
      bodyHtml?: string;
      bodyText?: string | null;
      audienceGroupId?: string | null;
      recipients?: Array<{ email: string; name?: string | null; contactId?: string | null }>;
    },
    request?: { ip?: string | null; userAgent?: string | null }
  ) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const existing = await this.requireCampaignForWrite(organizationId, input.campaignId);

    if (existing.status !== "draft") {
      throw new AppError("Only draft campaigns can be updated", 400, "email_campaign_not_editable");
    }

    const senderId = input.senderId ?? existing.sender_id;
    await this.senderService.getSenderForUse({ organizationId, senderId });

    const shouldReplaceRecipients = input.recipients !== undefined || input.audienceGroupId !== undefined;
    const prepared = shouldReplaceRecipients
      ? await this.prepareRecipients(
          organizationId,
          await this.collectRecipientCandidates(organizationId, input.audienceGroupId ?? null, input.recipients ?? [])
        )
      : null;

    await withTransaction(async (client) => {
      await client.query(
        `
          update email_campaigns
          set name = $3,
              sender_id = $4,
              subject = $5,
              body_html = $6,
              body_text = $7,
              audience_group_id = $8
          where organization_id = $1
            and id = $2
        `,
        [
          organizationId,
          input.campaignId,
          input.name?.trim() ?? existing.name,
          senderId,
          input.subject?.trim() ?? existing.subject,
          input.bodyHtml ?? existing.body_html,
          input.bodyText === undefined ? existing.body_text : input.bodyText?.trim() || stripHtml(input.bodyHtml ?? existing.body_html),
          input.audienceGroupId === undefined ? existing.audience_group_id : input.audienceGroupId
        ]
      );

      if (prepared) {
        await client.query(`delete from email_campaign_recipients where organization_id = $1 and campaign_id = $2`, [organizationId, input.campaignId]);
        await this.insertRecipients(client, organizationId, input.campaignId, prepared);
      }
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_campaign.updated",
      entityType: "email_campaign",
      entityId: input.campaignId,
      metadata: {
        sender_id: senderId,
        recipients_replaced: Boolean(prepared),
        recipient_counts: prepared?.summary ?? null
      },
      request
    });

    return this.getCampaign(user, { organizationId, campaignId: input.campaignId });
  }

  async sendCampaignTest(
    user: AuthUser,
    input: { organizationId?: string | null; campaignId: string; toEmail: string; subject?: string | null; message?: string | null },
    request?: { ip?: string | null; userAgent?: string | null }
  ) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const campaign = await this.requireCampaign(organizationId, input.campaignId);
    const sender = await this.senderService.getSenderForUse({ organizationId, senderId: campaign.sender_id });

    if (sender.status !== "verified") {
      throw new AppError("Sender must be verified before sending a campaign test", 400, "email_sender_not_verified");
    }

    const toEmail = normalizeEmail(input.toEmail);
    if (!isValidEmail(toEmail)) {
      throw new AppError("to_email must be a valid email address", 400, "invalid_email_address");
    }

    const unsubscribeLink = `${env.API_PUBLIC_URL}/unsubscribe/email/preview`;
    await this.senderService.sendMail({
      sender,
      to: toEmail,
      subject: input.subject?.trim() || campaign.subject,
      html: appendUnsubscribeFooter(input.message?.trim() || campaign.body_html, unsubscribeLink),
      text: stripHtml(input.message?.trim() || campaign.body_text || campaign.body_html)
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_campaign.test_sent",
      entityType: "email_campaign",
      entityId: campaign.id,
      metadata: {
        to_email: toEmail,
        sender_id: sender.id,
        from_email: sender.from_email
      },
      request
    });

    return { ok: true, message: `Test email sent to ${toEmail}.` };
  }

  async startCampaign(user: AuthUser, input: { organizationId?: string | null; campaignId: string }, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const campaign = await this.requireCampaignForWrite(organizationId, input.campaignId);
    const sender = await this.senderService.getSenderForUse({ organizationId, senderId: campaign.sender_id });

    if (sender.status !== "verified") {
      throw new AppError("Sender must be verified before starting a campaign", 400, "email_sender_not_verified");
    }

    if (!campaign.subject.trim() || !campaign.body_html.trim()) {
      throw new AppError("Campaign subject and body are required", 400, "email_campaign_content_required");
    }

    const summary = await this.getReport(user, { organizationId, campaignId: campaign.id });
    if (summary.total === 0 || summary.pending === 0) {
      throw new AppError("Campaign has no valid recipients to send", 400, "email_campaign_no_valid_recipients");
    }

    await query(
      `
        update email_campaigns
        set status = 'sending',
            started_at = coalesce(started_at, timezone('utc', now())),
            cancelled_at = null
        where organization_id = $1
          and id = $2
      `,
      [organizationId, campaign.id]
    );

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_campaign.started",
      entityType: "email_campaign",
      entityId: campaign.id,
      metadata: {
        sender_id: sender.id,
        from_email: sender.from_email,
        recipient_counts: summary
      },
      request
    });

    const processed = await this.processPendingBatch(env.EMAIL_CAMPAIGN_DISPATCH_WORKER_BATCH_SIZE, campaign.id);

    return {
      ok: true,
      message: processed > 0 ? `Campaign started. ${processed} recipients processed immediately.` : "Campaign started. Worker will continue dispatch."
    };
  }

  async pauseCampaign(user: AuthUser, input: { organizationId?: string | null; campaignId: string }, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const campaign = await this.requireCampaign(organizationId, input.campaignId);

    if (campaign.status !== "sending") {
      throw new AppError("Only sending campaigns can be paused", 400, "email_campaign_not_sending");
    }

    await query(`update email_campaigns set status = 'paused' where organization_id = $1 and id = $2`, [organizationId, input.campaignId]);

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_campaign.paused",
      entityType: "email_campaign",
      entityId: input.campaignId,
      metadata: null,
      request
    });

    return { ok: true };
  }

  async cancelCampaign(user: AuthUser, input: { organizationId?: string | null; campaignId: string }, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureCampaignWriteAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const campaign = await this.requireCampaign(organizationId, input.campaignId);

    if (!["draft", "scheduled", "sending", "paused"].includes(campaign.status)) {
      throw new AppError("Campaign cannot be cancelled", 400, "email_campaign_not_cancellable");
    }

    await query(
      `
        update email_campaigns
        set status = 'cancelled',
            cancelled_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
      `,
      [organizationId, input.campaignId]
    );

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_campaign.cancelled",
      entityType: "email_campaign",
      entityId: input.campaignId,
      metadata: null,
      request
    });

    return { ok: true };
  }

  async listRecipients(user: AuthUser, input: { organizationId?: string | null; campaignId: string; status?: string; q?: string; page?: number; limit?: number }) {
    ensureReadAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    await this.requireCampaign(organizationId, input.campaignId);
    const page = Math.max(input.page ?? 1, 1);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 250);
    const offset = (page - 1) * limit;
    const values: unknown[] = [organizationId, input.campaignId];
    const filters = ["organization_id = $1", "campaign_id = $2"];

    if (input.status) {
      values.push(input.status);
      filters.push(`status = $${values.length}`);
    }

    if (input.q?.trim()) {
      values.push(`%${input.q.trim()}%`);
      filters.push(`(email ilike $${values.length} or coalesce(name, '') ilike $${values.length} or coalesce(failure_reason, '') ilike $${values.length})`);
    }

    values.push(limit, offset);
    const result = await query<EmailCampaignRecipientRow>(
      `
        select *, count(*) over()::text as total_count
        from email_campaign_recipients
        where ${filters.join(" and ")}
        order by created_at asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values
    );

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total: Number(result.rows[0]?.total_count ?? 0)
      }
    };
  }

  async getReport(user: AuthUser, input: { organizationId?: string | null; campaignId: string }) {
    ensureReadAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    await this.requireCampaign(organizationId, input.campaignId);
    const result = await query<{
      total: string;
      pending: string;
      skipped: string;
      sent: string;
      failed: string;
      unsubscribed: string;
      bounced: string;
      opened: string;
      clicked: string;
    }>(
      `
        select
          count(*)::text as total,
          count(*) filter (where status = 'pending')::text as pending,
          count(*) filter (where status = 'skipped')::text as skipped,
          count(*) filter (where status = 'sent')::text as sent,
          count(*) filter (where status = 'failed')::text as failed,
          count(*) filter (where status = 'unsubscribed')::text as unsubscribed,
          count(*) filter (where status = 'bounced')::text as bounced,
          count(*) filter (where opened_at is not null)::text as opened,
          count(*) filter (where clicked_at is not null)::text as clicked
        from email_campaign_recipients
        where organization_id = $1
          and campaign_id = $2
      `,
      [organizationId, input.campaignId]
    );

    const row = result.rows[0] ?? {
      total: "0",
      pending: "0",
      skipped: "0",
      sent: "0",
      failed: "0",
      unsubscribed: "0",
      bounced: "0",
      opened: "0",
      clicked: "0"
    };

    return {
      total: Number(row.total),
      pending: Number(row.pending),
      skipped: Number(row.skipped),
      sent: Number(row.sent),
      failed: Number(row.failed),
      unsubscribed: Number(row.unsubscribed),
      bounced: Number(row.bounced),
      opened: Number(row.opened),
      clicked: Number(row.clicked),
      tracking_supported: false
    };
  }

  async listHistory(user: AuthUser, input?: { organizationId?: string | null; limit?: number }) {
    ensureReadAccess(user);
    const organizationId = resolveOrganizationId(user, input?.organizationId);
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
    const result = await query<SendHistoryRow>(
      `
        select id, organization_id, action, entity_type, entity_id, metadata, created_at
        from audit_logs
        where organization_id = $1
          and action like 'email%'
        order by created_at desc
        limit $2
      `,
      [organizationId, limit]
    );

    return result.rows;
  }

  async unsubscribeByToken(token: string) {
    const result = await withTransaction(async (client) => {
      const tokenResult = await client.query<{
        id: string;
        organization_id: string;
        campaign_id: string | null;
        recipient_id: string | null;
        email: string;
      }>(
        `
          select id, organization_id, campaign_id, recipient_id, email
          from email_unsubscribe_tokens
          where token = $1
          limit 1
        `,
        [token]
      );

      const row = tokenResult.rows[0];

      if (!row) {
        throw new AppError("Unsubscribe link is invalid or expired", 404, "email_unsubscribe_invalid");
      }

      await client.query(
        `
          update email_unsubscribe_tokens
          set used_at = coalesce(used_at, timezone('utc', now()))
          where id = $1
        `,
        [row.id]
      );

      await client.query(
        `
          delete from email_suppression_list
          where organization_id = $1
            and lower(email) = lower($2)
        `,
        [row.organization_id, row.email]
      );

      const suppression = await client.query<SuppressionRow>(
        `
          insert into email_suppression_list (
            organization_id,
            email,
            reason,
            source,
            note,
            created_by_user_id
          ) values ($1, $2, 'unsubscribed', 'public_unsubscribe', null, null)
          returning *
        `,
        [row.organization_id, normalizeEmail(row.email)]
      );

      if (row.recipient_id) {
        await client.query(
          `
            update email_campaign_recipients
            set status = 'unsubscribed',
                failure_code = null,
                failure_reason = 'Recipient unsubscribed'
            where id = $1
              and organization_id = $2
          `,
          [row.recipient_id, row.organization_id]
        );
      }

      await client.query(
        `
          insert into email_send_events (
            organization_id,
            campaign_id,
            recipient_id,
            sender_id,
            event_type,
            provider_response,
            error_message
          ) values ($1, $2, $3, null, 'unsubscribed', null, null)
        `,
        [row.organization_id, row.campaign_id, row.recipient_id]
      );

      return row;
    });

    await this.auditLogService.record(null, {
      organizationId: result.organization_id,
      action: "email.unsubscribed",
      entityType: "email_unsubscribe",
      entityId: result.id,
      metadata: {
        campaign_id: result.campaign_id,
        recipient_id: result.recipient_id,
        email: result.email
      }
    });

    return result;
  }

  async processPendingBatch(limit = env.EMAIL_CAMPAIGN_DISPATCH_WORKER_BATCH_SIZE, campaignId?: string) {
    let processed = 0;

    for (let index = 0; index < limit; index += 1) {
      const claimed = await this.claimNextRecipient(campaignId);

      if (!claimed) {
        break;
      }

      await this.processRecipient(claimed);
      processed += 1;
    }

    return processed;
  }

  private async processRecipient(recipient: EmailCampaignRecipientRow & { campaign_subject: string; campaign_body_html: string; campaign_body_text: string | null; sender_id: string }) {
    const sender = await this.senderService.getSenderForUse({ organizationId: recipient.organization_id, senderId: recipient.sender_id });
    const unsubscribeToken = await this.createUnsubscribeToken({
      organizationId: recipient.organization_id,
      campaignId: recipient.campaign_id,
      recipientId: recipient.id,
      email: recipient.email
    });
    const unsubscribeLink = `${env.API_PUBLIC_URL}/unsubscribe/email/${unsubscribeToken.token}`;
    const subject = renderMailMergeTemplate(recipient.campaign_subject, recipient);
    const html = appendUnsubscribeFooter(renderMailMergeTemplate(recipient.campaign_body_html, recipient), unsubscribeLink);
    const text = stripHtml(renderMailMergeTemplate(recipient.campaign_body_text || recipient.campaign_body_html, recipient));

    try {
      const response = await this.senderService.sendMail({
        sender,
        to: recipient.email,
        subject,
        html,
        text
      });

      await withTransaction(async (client) => {
        await client.query(
          `
            update email_campaign_recipients
            set status = 'sent',
                provider_message_id = $4,
                unsubscribe_token_id = $5,
                sent_at = timezone('utc', now())
            where organization_id = $1
              and campaign_id = $2
              and id = $3
          `,
          [recipient.organization_id, recipient.campaign_id, recipient.id, response.messageId ?? null, unsubscribeToken.id]
        );

        await client.query(
          `
            insert into email_send_events (
              organization_id,
              campaign_id,
              recipient_id,
              sender_id,
              event_type,
              provider_response,
              error_message
            ) values ($1, $2, $3, $4, 'sent', $5::jsonb, null)
          `,
          [recipient.organization_id, recipient.campaign_id, recipient.id, sender.id, JSON.stringify({ messageId: response.messageId ?? null })]
        );

        await this.refreshCampaignCompletion(client, recipient.organization_id, recipient.campaign_id);
      });
    } catch (error) {
      const errorMessage = sanitizeProviderError(error);

      await withTransaction(async (client) => {
        await client.query(
          `
            update email_campaign_recipients
            set status = 'failed',
                failure_code = 'provider_error',
                failure_reason = $4,
                unsubscribe_token_id = $5
            where organization_id = $1
              and campaign_id = $2
              and id = $3
          `,
          [recipient.organization_id, recipient.campaign_id, recipient.id, errorMessage, unsubscribeToken.id]
        );

        await client.query(
          `
            insert into email_send_events (
              organization_id,
              campaign_id,
              recipient_id,
              sender_id,
              event_type,
              provider_response,
              error_message
            ) values ($1, $2, $3, $4, 'failed', null, $5)
          `,
          [recipient.organization_id, recipient.campaign_id, recipient.id, sender.id, errorMessage]
        );

        await this.refreshCampaignCompletion(client, recipient.organization_id, recipient.campaign_id);
      });
    }
  }

  private async claimNextRecipient(campaignId?: string) {
    return withTransaction(async (client) => {
      const campaignFilter = campaignId ? "and ec.id = $1" : "";
      const result = await client.query<EmailCampaignRecipientRow & { campaign_subject: string; campaign_body_html: string; campaign_body_text: string | null; sender_id: string }>(
        `
          with candidate as (
            select ecr.id
            from email_campaign_recipients ecr
            join email_campaigns ec on ec.id = ecr.campaign_id
            where ec.status = 'sending'
              ${campaignFilter}
              and ecr.status = 'pending'
            order by ecr.created_at asc
            for update skip locked
            limit 1
          )
          update email_campaign_recipients ecr
          set status = 'sending'
          from candidate, email_campaigns ec
          where ecr.id = candidate.id
            and ec.id = ecr.campaign_id
          returning ecr.*, ec.subject as campaign_subject, ec.body_html as campaign_body_html, ec.body_text as campaign_body_text, ec.sender_id
        `,
        campaignId ? [campaignId] : []
      );

      return result.rows[0] ?? null;
    });
  }

  private async refreshCampaignCompletion(client: PoolClient, organizationId: string, campaignId: string) {
    const result = await client.query<{
      pending_count: string;
      sent_count: string;
    }>(
      `
        select
          count(*) filter (where status in ('pending', 'sending'))::text as pending_count,
          count(*) filter (where status = 'sent')::text as sent_count
        from email_campaign_recipients
        where organization_id = $1
          and campaign_id = $2
      `,
      [organizationId, campaignId]
    );

    const counts = result.rows[0];
    if (!counts || Number(counts.pending_count) > 0) {
      return;
    }

    await client.query(
      `
        update email_campaigns
        set status = case when $3::int > 0 then 'sent' else 'failed' end,
            completed_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
          and status = 'sending'
      `,
      [organizationId, campaignId, Number(counts.sent_count)]
    );
  }

  private async createUnsubscribeToken(input: { organizationId: string; campaignId: string; recipientId: string; email: string }) {
    const token = crypto.randomBytes(24).toString("base64url");
    const result = await query<{ id: string; token: string }>(
      `
        insert into email_unsubscribe_tokens (
          organization_id,
          campaign_id,
          recipient_id,
          email,
          token
        ) values ($1, $2, $3, $4, $5)
        returning id, token
      `,
      [input.organizationId, input.campaignId, input.recipientId, input.email, token]
    );

    return result.rows[0];
  }

  private async requireCampaign(organizationId: string, campaignId: string) {
    const result = await query<EmailCampaignRow>(
      `
        select *
        from email_campaigns
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [organizationId, campaignId]
    );

    const campaign = result.rows[0];
    if (!campaign) {
      throw new AppError("Email campaign not found", 404, "email_campaign_not_found");
    }

    return campaign;
  }

  private async requireCampaignForWrite(organizationId: string, campaignId: string) {
    return this.requireCampaign(organizationId, campaignId);
  }

  private async collectRecipientCandidates(
    organizationId: string,
    audienceGroupId: string | null,
    directRecipients: Array<{ email: string; name?: string | null; contactId?: string | null }>
  ) {
    const recipients: RecipientCandidate[] = directRecipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name ?? null,
      contactId: recipient.contactId ?? null,
      company: null,
      phone: null
    }));

    if (audienceGroupId) {
      const audienceRows = await query<{ crm_contact_id: string | null; contact_email: string | null; audience_name: string | null; company_name: string | null; primary_phone_e164: string | null }>(
        `
          select
            cac.crm_contact_id,
            c.email as contact_email,
            coalesce(c.display_name, cac.name) as audience_name,
            c.company_name,
            c.primary_phone_e164
          from campaign_audience_contacts cac
          left join contacts c on c.id = cac.crm_contact_id and c.organization_id = cac.organization_id
          where cac.organization_id = $1
            and cac.audience_group_id = $2
            and cac.validation_status = 'valid'
            and cac.is_duplicate = false
        `,
        [organizationId, audienceGroupId]
      );

      for (const row of audienceRows.rows) {
        recipients.push({
          email: row.contact_email,
          name: row.audience_name,
          contactId: row.crm_contact_id,
          company: row.company_name,
          phone: row.primary_phone_e164
        });
      }
    }

    return recipients;
  }

  private async prepareRecipients(organizationId: string, candidates: RecipientCandidate[]) {
    const suppressedSet = await this.getSuppressedEmailSet(organizationId);
    const seen = new Set<string>();
    const rows: Array<{ email: string; name: string | null; contactId: string | null; company: string | null; phone: string | null; status: EmailCampaignRecipientRow["status"]; failureCode: string | null; failureReason: string | null }> = [];
    let invalidCount = 0;
    let suppressedCount = 0;
    let duplicateCount = 0;
    let acceptedCount = 0;

    for (const candidate of candidates) {
      const normalizedEmail = candidate.email ? normalizeEmail(candidate.email) : "";

      if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
        invalidCount += 1;
        rows.push({
          email: normalizedEmail || `invalid-${crypto.randomUUID()}@invalid.local`,
          name: candidate.name,
          contactId: candidate.contactId,
          company: candidate.company,
          phone: candidate.phone,
          status: "skipped",
          ...buildRecipientFailure("invalid_email", candidate.email ? "Invalid email address" : "Contact has no email address")
        });
        continue;
      }

      if (seen.has(normalizedEmail)) {
        duplicateCount += 1;
        continue;
      }

      seen.add(normalizedEmail);

      if (suppressedSet.has(normalizedEmail)) {
        suppressedCount += 1;
        rows.push({
          email: normalizedEmail,
          name: candidate.name,
          contactId: candidate.contactId,
          company: candidate.company,
          phone: candidate.phone,
          status: "skipped",
          ...buildRecipientFailure("suppressed", "Recipient is on the suppression list")
        });
        continue;
      }

      acceptedCount += 1;
      rows.push({
        email: normalizedEmail,
        name: candidate.name,
        contactId: candidate.contactId,
        company: candidate.company,
        phone: candidate.phone,
        status: "pending",
        failureCode: null,
        failureReason: null
      });
    }

    return {
      rows,
      summary: {
        total_input: candidates.length,
        accepted: acceptedCount,
        invalid: invalidCount,
        suppressed: suppressedCount,
        deduplicated: duplicateCount
      }
    };
  }

  private async insertRecipients(
    client: PoolClient,
    organizationId: string,
    campaignId: string,
    prepared: {
      rows: Array<{ email: string; name: string | null; contactId: string | null; company: string | null; phone: string | null; status: EmailCampaignRecipientRow["status"]; failureCode: string | null; failureReason: string | null }>;
    }
  ) {
    for (const row of prepared.rows) {
      await client.query(
        `
          insert into email_campaign_recipients (
            organization_id,
            campaign_id,
            contact_id,
            email,
            name,
            company,
            phone,
            status,
            failure_code,
            failure_reason
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [organizationId, campaignId, row.contactId, row.email, row.name, row.company, row.phone, row.status, row.failureCode, row.failureReason]
      );
    }
  }

  private async getSuppressedEmailSet(organizationId: string) {
    const result = await query<{ email: string }>(
      `
        select email
        from email_suppression_list
        where organization_id = $1
      `,
      [organizationId]
    );

    return new Set(result.rows.map((row) => normalizeEmail(row.email)));
  }

  private mapCampaignSummary(row: EmailCampaignSummaryRow) {
    return {
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      subject: row.subject,
      body_html: row.body_html,
      body_text: row.body_text,
      sender_id: row.sender_id,
      sender_display_name: row.sender_display_name,
      sender_from_email: row.sender_from_email,
      audience_group_id: row.audience_group_id,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      recipients: Number(row.total_recipients),
      pending: Number(row.pending_recipients),
      sent: Number(row.sent_recipients),
      failed: Number(row.failed_recipients),
      skipped: Number(row.skipped_recipients),
      unsubscribed: Number(row.unsubscribed_recipients)
    };
  }
}
