import nodemailer from "nodemailer";
import { query, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { decryptEmailSecret, encryptEmailSecret } from "../lib/emailSecretCrypto.js";
import type { AuthUser } from "../types/auth.js";
import { AuditLogService } from "./auditLogService.js";
import { MicrosoftEmailService } from "./microsoftEmailService.js";

type EmailSenderRow = {
  id: string;
  organization_id: string;
  sender_type: "smtp" | "gmail" | "microsoft365";
  display_name: string;
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_username: string | null;
  smtp_password_encrypted: string | null;
  oauth_provider: string | null;
  oauth_account_email: string | null;
  oauth_provider_user_id: string | null;
  oauth_tenant_id: string | null;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string[] | null;
  oauth_connected_at: string | null;
  status: "draft" | "verified" | "failed" | "disabled" | "expired" | "reconnect_required";
  last_test_status: string | null;
  last_test_error: string | null;
  last_test_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailSenderView = Omit<
  EmailSenderRow,
  "smtp_password_encrypted" | "oauth_access_token_encrypted" | "oauth_refresh_token_encrypted" | "smtp_username" | "oauth_account_email"
> & {
  smtp_username_masked: string | null;
  oauth_account_email_masked: string | null;
  smtp_password_configured: boolean;
  oauth_tokens_configured: boolean;
};

export type CreateEmailSenderInput = {
  organizationId?: string | null;
  senderType: "smtp" | "gmail" | "microsoft365";
  displayName: string;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUsername?: string | null;
  smtpPassword?: string | null;
};

export type UpdateEmailSenderInput = Partial<CreateEmailSenderInput> & {
  senderId: string;
};

export type TestEmailSenderInput = {
  organizationId?: string | null;
  senderId: string;
  toEmail: string;
  subject?: string | null;
  message?: string | null;
};

function ensureReadAccess(user: AuthUser) {
  if (["super_admin", "org_admin", "manager"].includes(user.role)) {
    return;
  }

  throw new AppError("Insufficient permissions", 403, "email_campaign_forbidden");
}

function ensureSenderSetupAccess(user: AuthUser) {
  if (user.role === "super_admin" || user.role === "org_admin") {
    return;
  }

  if (user.role === "manager" && user.permissionKeys.includes("org.manage_settings")) {
    return;
  }

  throw new AppError("Insufficient permissions", 403, "email_sender_write_forbidden");
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

function maskValue(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.includes("@")) {
    const [localPart, domain] = value.split("@");
    if (!domain) return `${value.slice(0, 2)}***`;
    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  if (value.length <= 4) {
    return "****";
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function normalizeSenderInput(input: Partial<CreateEmailSenderInput>) {
  const senderType = input.senderType ?? "smtp";

  if (senderType === "gmail") {
    return {
      smtpHost: input.smtpHost?.trim() || "smtp.gmail.com",
      smtpPort: input.smtpPort ?? 465,
      smtpSecure: input.smtpSecure ?? true
    };
  }

  if (senderType === "microsoft365") {
    return {
      smtpHost: null,
      smtpPort: null,
      smtpSecure: input.smtpSecure ?? false
    };
  }

  return {
    smtpHost: input.smtpHost?.trim() || null,
    smtpPort: input.smtpPort ?? null,
    smtpSecure: input.smtpSecure ?? true
  };
}

function validateEmailAddress(email: string, fieldName: string) {
  const trimmed = email.trim().toLowerCase();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

  if (!isValid) {
    throw new AppError(`${fieldName} must be a valid email address`, 400, "invalid_email_address");
  }

  return trimmed;
}

function sanitizeProviderError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unable to complete email request.";
}

export class EmailSenderService {
  constructor(
    private readonly auditLogService = new AuditLogService(),
    private readonly microsoftEmailService = new MicrosoftEmailService()
  ) {}

  async listSenders(user: AuthUser, input?: { organizationId?: string | null }) {
    ensureReadAccess(user);
    const organizationId = resolveOrganizationId(user, input?.organizationId);
    const result = await query<EmailSenderRow>(
      `
        select *
        from email_senders
        where organization_id = $1
        order by created_at desc, display_name asc
      `,
      [organizationId]
    );

    return result.rows.map((row) => this.maskSenderSecrets(row));
  }

  async getSenderForUse(input: { organizationId: string; senderId: string }) {
    const result = await query<EmailSenderRow>(
      `
        select *
        from email_senders
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [input.organizationId, input.senderId]
    );

    const sender = result.rows[0];

    if (!sender) {
      throw new AppError("Email sender not found", 404, "email_sender_not_found");
    }

    return sender;
  }

  async createSender(user: AuthUser, input: CreateEmailSenderInput, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureSenderSetupAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const normalized = normalizeSenderInput(input);
    const fromEmail = validateEmailAddress(input.fromEmail, "from_email");
    const replyToEmail = input.replyToEmail ? validateEmailAddress(input.replyToEmail, "reply_to_email") : null;

    if (input.senderType === "microsoft365") {
      throw new AppError(
        "Microsoft senders must be connected with Microsoft OAuth. Click Connect Microsoft Account instead.",
        400,
        "microsoft_oauth_required"
      );
    }

    if (!input.displayName.trim()) {
      throw new AppError("display_name is required", 400, "email_sender_display_name_required");
    }

    if (!input.fromName.trim()) {
      throw new AppError("from_name is required", 400, "email_sender_from_name_required");
    }

    if (!normalized.smtpHost) {
      throw new AppError("smtp_host is required", 400, "email_sender_host_required");
    }

    if (!normalized.smtpPort) {
      throw new AppError("smtp_port is required", 400, "email_sender_port_required");
    }

    if ((input.smtpUsername ?? "").trim().length === 0) {
      throw new AppError("smtp_username is required", 400, "email_sender_username_required");
    }

    if ((input.smtpPassword ?? "").trim().length === 0) {
      throw new AppError("smtp_password is required", 400, "email_sender_password_required");
    }

    const result = await withTransaction(async (client) => {
      const inserted = await client.query<EmailSenderRow>(
        `
          insert into email_senders (
            organization_id,
            sender_type,
            display_name,
            from_name,
            from_email,
            reply_to_email,
            smtp_host,
            smtp_port,
            smtp_secure,
            smtp_username,
            smtp_password_encrypted,
            created_by_user_id
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          returning *
        `,
        [
          organizationId,
          input.senderType,
          input.displayName.trim(),
          input.fromName.trim(),
          fromEmail,
          replyToEmail,
          normalized.smtpHost,
          normalized.smtpPort,
          normalized.smtpSecure,
          input.smtpUsername?.trim() ?? null,
          encryptEmailSecret(input.smtpPassword!.trim()),
          user.organizationUserId
        ]
      );

      return inserted.rows[0];
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_sender.created",
      entityType: "email_sender",
      entityId: result.id,
      metadata: {
        sender_type: result.sender_type,
        display_name: result.display_name,
        from_email: result.from_email,
        smtp_host: result.smtp_host,
        smtp_port: result.smtp_port
      },
      request
    });

    return this.maskSenderSecrets(result);
  }

  async updateSender(user: AuthUser, input: UpdateEmailSenderInput, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureSenderSetupAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const existing = await this.getSenderForUse({ organizationId, senderId: input.senderId });
    const senderType = input.senderType ?? existing.sender_type;

    if (senderType === "microsoft365") {
      if (!existing.oauth_refresh_token_encrypted) {
        throw new AppError(
          "Microsoft senders must be connected with Microsoft OAuth. Click Connect Microsoft Account instead.",
          400,
          "microsoft_oauth_required"
        );
      }

      if (input.smtpPassword || input.smtpUsername || input.smtpHost || input.smtpPort) {
        throw new AppError("Microsoft sender settings cannot use SMTP username or password.", 400, "microsoft_smtp_not_supported");
      }
    }

    const normalized = normalizeSenderInput({ ...input, senderType });
    const fromEmail = input.fromEmail ? validateEmailAddress(input.fromEmail, "from_email") : existing.from_email;
    const replyToEmail =
      input.replyToEmail === undefined
        ? existing.reply_to_email
        : input.replyToEmail
          ? validateEmailAddress(input.replyToEmail, "reply_to_email")
          : null;

    const nextPasswordEncrypted =
      input.smtpPassword === undefined
        ? existing.smtp_password_encrypted
        : input.smtpPassword
          ? encryptEmailSecret(input.smtpPassword.trim())
          : null;

    const result = await withTransaction(async (client) => {
      const updated = await client.query<EmailSenderRow>(
        `
          update email_senders
          set sender_type = $3,
              display_name = $4,
              from_name = $5,
              from_email = $6,
              reply_to_email = $7,
              smtp_host = $8,
              smtp_port = $9,
              smtp_secure = $10,
              smtp_username = $11,
              smtp_password_encrypted = $12,
              status = case when status = 'disabled' then status else 'draft' end,
              last_test_status = null,
              last_test_error = null,
              last_test_at = null
          where organization_id = $1
            and id = $2
          returning *
        `,
        [
          organizationId,
          input.senderId,
          senderType,
          input.displayName?.trim() ?? existing.display_name,
          input.fromName?.trim() ?? existing.from_name,
          fromEmail,
          replyToEmail,
          normalized.smtpHost,
          normalized.smtpPort,
          normalized.smtpSecure,
          input.smtpUsername === undefined ? existing.smtp_username : input.smtpUsername?.trim() ?? null,
          nextPasswordEncrypted
        ]
      );

      return updated.rows[0];
    });

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_sender.updated",
      entityType: "email_sender",
      entityId: result.id,
      metadata: {
        sender_type: result.sender_type,
        display_name: result.display_name,
        from_email: result.from_email,
        smtp_host: result.smtp_host,
        smtp_port: result.smtp_port,
        password_updated: input.smtpPassword !== undefined
      },
      request
    });

    return this.maskSenderSecrets(result);
  }

  async testSender(user: AuthUser, input: TestEmailSenderInput, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureSenderSetupAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const sender = await this.getSenderForUse({ organizationId, senderId: input.senderId });
    const toEmail = validateEmailAddress(input.toEmail, "to_email");

    try {
      await this.sendMail({
        sender,
        to: toEmail,
        subject: input.subject?.trim() || `Test email from ${sender.display_name}`,
        html: `<p>${(input.message?.trim() || "This is a sender verification email.").replace(/</g, "&lt;")}</p>`,
        text: input.message?.trim() || "This is a sender verification email."
      });

      const updated = await query<EmailSenderRow>(
        `
          update email_senders
          set status = 'verified',
              last_test_status = 'success',
              last_test_error = null,
              last_test_at = timezone('utc', now())
          where organization_id = $1
            and id = $2
          returning *
        `,
        [organizationId, input.senderId]
      );

      await this.auditLogService.record(user, {
        organizationId,
        action: "email_sender.test_sent",
        entityType: "email_sender",
        entityId: input.senderId,
        metadata: {
          to_email: toEmail,
          outcome: "success",
          from_email: sender.from_email
        },
        request
      });

      return {
        sender: this.maskSenderSecrets(updated.rows[0]),
        result: {
          ok: true,
          message: `Test email sent to ${toEmail}.`
        }
      };
    } catch (error) {
      const errorMessage = sanitizeProviderError(error);

      const updated = await query<EmailSenderRow>(
        `
          update email_senders
          set status = 'failed',
              last_test_status = 'failed',
              last_test_error = $3,
              last_test_at = timezone('utc', now())
          where organization_id = $1
            and id = $2
          returning *
        `,
        [organizationId, input.senderId, errorMessage]
      );

      await this.auditLogService.record(user, {
        organizationId,
        action: "email_sender.test_sent",
        entityType: "email_sender",
        entityId: input.senderId,
        metadata: {
          to_email: toEmail,
          outcome: "failed",
          from_email: sender.from_email,
          failure_reason: errorMessage
        },
        request
      });

      throw new AppError(errorMessage, 400, "email_sender_test_failed", {
        sender: this.maskSenderSecrets(updated.rows[0])
      });
    }
  }

  async disableSender(user: AuthUser, input: { organizationId?: string | null; senderId: string }, request?: { ip?: string | null; userAgent?: string | null }) {
    ensureSenderSetupAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    await this.getSenderForUse({ organizationId, senderId: input.senderId });

    const updated = await query<EmailSenderRow>(
      `
        update email_senders
        set status = 'disabled'
        where organization_id = $1
          and id = $2
        returning *
      `,
      [organizationId, input.senderId]
    );

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_sender.disabled",
      entityType: "email_sender",
      entityId: input.senderId,
      metadata: {
        from_email: updated.rows[0]?.from_email ?? null
      },
      request
    });

    return this.maskSenderSecrets(updated.rows[0]);
  }

  maskSenderSecrets(row: EmailSenderRow): EmailSenderView {
    return {
      id: row.id,
      organization_id: row.organization_id,
      sender_type: row.sender_type,
      display_name: row.display_name,
      from_name: row.from_name,
      from_email: row.from_email,
      reply_to_email: row.reply_to_email,
      smtp_host: row.smtp_host,
      smtp_port: row.smtp_port,
      smtp_secure: row.smtp_secure,
      oauth_provider: row.oauth_provider,
      oauth_provider_user_id: row.oauth_provider_user_id,
      oauth_tenant_id: row.oauth_tenant_id,
      oauth_token_expires_at: row.oauth_token_expires_at,
      oauth_scopes: row.oauth_scopes,
      oauth_connected_at: row.oauth_connected_at,
      status: row.status,
      last_test_status: row.last_test_status,
      last_test_error: row.last_test_error,
      last_test_at: row.last_test_at,
      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      smtp_username_masked: maskValue(row.smtp_username),
      oauth_account_email_masked: maskValue(row.oauth_account_email),
      smtp_password_configured: Boolean(row.smtp_password_encrypted),
      oauth_tokens_configured: Boolean(row.oauth_access_token_encrypted || row.oauth_refresh_token_encrypted)
    };
  }

  async sendMail(input: {
    sender: EmailSenderRow;
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string | null;
  }) {
    if (input.sender.sender_type === "microsoft365") {
      if (!input.sender.oauth_provider || !input.sender.oauth_refresh_token_encrypted) {
        throw new AppError("Microsoft account needs to be reconnected.", 400, "microsoft_reconnect_required");
      }

      return this.microsoftEmailService.sendMicrosoftGraphEmail({
        connectionId: input.sender.id,
        to: [input.to],
        subject: input.subject,
        htmlBody: input.html,
        textBody: input.text,
        replyTo: input.replyTo ?? input.sender.reply_to_email ?? undefined
      });
    }

    const transport = this.buildTransport(input.sender);

    return transport.sendMail({
      from: `${input.sender.from_name} <${input.sender.from_email}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo ?? input.sender.reply_to_email ?? undefined
    });
  }

  buildTransport(sender: EmailSenderRow) {
    if (!sender.smtp_host || !sender.smtp_port || !sender.smtp_username || !sender.smtp_password_encrypted) {
      throw new AppError("Sender transport is incomplete", 400, "email_sender_transport_incomplete");
    }

    return nodemailer.createTransport({
      host: sender.smtp_host,
      port: sender.smtp_port,
      secure: sender.smtp_secure,
      auth: {
        user: sender.smtp_username,
        pass: decryptEmailSecret(sender.smtp_password_encrypted)
      }
    });
  }
}
