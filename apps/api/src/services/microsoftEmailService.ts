import crypto from "node:crypto";
import { env } from "../config/env.js";
import { query, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { decryptEmailSecret, encryptEmailSecret } from "../lib/emailSecretCrypto.js";
import type { AuthUser } from "../types/auth.js";
import { AuditLogService } from "./auditLogService.js";

const MICROSOFT_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Send"];
const STATE_TTL_MINUTES = 10;
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type MicrosoftGraphProfile = {
  id?: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
};

type EmailSenderOAuthRow = {
  id: string;
  organization_id: string;
  sender_type: "smtp" | "gmail" | "microsoft365";
  display_name: string;
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  oauth_provider: string | null;
  oauth_provider_user_id: string | null;
  oauth_tenant_id: string | null;
  oauth_account_email: string | null;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string[] | null;
  oauth_connected_at: string | null;
  status: "draft" | "verified" | "failed" | "disabled" | "expired" | "reconnect_required";
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
};

type OAuthStateRow = {
  state: string;
  organization_id: string;
  user_id: string;
  provider: string;
  redirect_to: string | null;
  expires_at: string;
  consumed_at: string | null;
};

function ensureSetupAccess(user: AuthUser) {
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

function getRedirectUri() {
  return env.MICROSOFT_REDIRECT_URI ?? `${env.API_PUBLIC_URL}/api/email/microsoft/callback`;
}

function getTenant() {
  return env.MICROSOFT_TENANT || "common";
}

function getMicrosoftAuthorizeUrl() {
  return `https://login.microsoftonline.com/${encodeURIComponent(getTenant())}/oauth2/v2.0/authorize`;
}

function getMicrosoftTokenUrl() {
  return `https://login.microsoftonline.com/${encodeURIComponent(getTenant())}/oauth2/v2.0/token`;
}

function requireMicrosoftConfig() {
  const missing = [
    env.MICROSOFT_CLIENT_ID ? null : "MICROSOFT_CLIENT_ID",
    env.MICROSOFT_CLIENT_SECRET ? null : "MICROSOFT_CLIENT_SECRET"
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new AppError(
      `Microsoft email OAuth is not configured. Missing: ${missing.join(", ")}`,
      500,
      "microsoft_oauth_not_configured"
    );
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateEmail(email: string, fieldName = "email") {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new AppError(`${fieldName} must be a valid email address`, 400, "invalid_email_address");
  }
  return normalized;
}

function validateEmailList(values: string[] | undefined, fieldName: string) {
  return (values ?? []).filter(Boolean).map((value) => validateEmail(value, fieldName));
}

function decodeTenantId(idToken: string | undefined) {
  if (!idToken) {
    return null;
  }

  try {
    const [, payload] = idToken.split(".");
    if (!payload) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { tid?: unknown };
    return typeof parsed.tid === "string" ? parsed.tid : null;
  } catch {
    return null;
  }
}

function tokenExpiryDate(expiresInSeconds: number | undefined) {
  const expiresIn = Math.max(expiresInSeconds ?? 3600, 60);
  return new Date(Date.now() + expiresIn * 1000);
}

function sanitizeMicrosoftError(body: MicrosoftTokenResponse | null, fallback: string) {
  const raw = body?.error_description || body?.error || fallback;
  return raw.replace(/\s+/g, " ").trim();
}

function microsoftSendError(responseStatus: number, body: unknown) {
  const graphMessage =
    typeof body === "object" && body && "error" in body
      ? (body as { error?: { message?: unknown } }).error?.message
      : null;

  if (responseStatus === 403) {
    return "Microsoft Graph denied Mail.Send permission. Ask the Microsoft admin to approve Mail.Send, then reconnect.";
  }

  if (responseStatus === 429) {
    return "Microsoft Graph is rate limiting this mailbox. Please wait and try again.";
  }

  return typeof graphMessage === "string" && graphMessage.trim()
    ? graphMessage.trim()
    : "Microsoft Graph could not send this email.";
}

function buildRecipient(address: string) {
  return {
    emailAddress: {
      address
    }
  };
}

export class MicrosoftEmailService {
  constructor(private readonly auditLogService = new AuditLogService()) {}

  async getAuthUrl(user: AuthUser, input: { organizationId?: string | null; redirectTo?: string | null }) {
    ensureSetupAccess(user);
    requireMicrosoftConfig();

    if (!user.organizationUserId) {
      throw new AppError("CRM user context is required", 400, "organization_user_required");
    }

    const organizationId = resolveOrganizationId(user, input.organizationId);
    const state = crypto.randomBytes(32).toString("base64url");
    const redirectTo = input.redirectTo?.startsWith("/") ? input.redirectTo : "/setup/channels/email";

    await query(
      `
        insert into email_oauth_states (
          state,
          organization_id,
          user_id,
          provider,
          redirect_to,
          expires_at
        ) values ($1, $2, $3, 'microsoft', $4, timezone('utc', now()) + ($5 || ' minutes')::interval)
      `,
      [state, organizationId, user.organizationUserId, redirectTo, STATE_TTL_MINUTES]
    );

    const url = new URL(getMicrosoftAuthorizeUrl());
    url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID ?? "");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", getRedirectUri());
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");

    return { url: url.toString() };
  }

  async handleCallback(user: AuthUser, input: { code?: string | null; state?: string | null; error?: string | null; errorDescription?: string | null }) {
    ensureSetupAccess(user);
    requireMicrosoftConfig();

    const redirectBase = new URL("/setup/channels/email", env.FRONTEND_URL);

    if (input.error) {
      redirectBase.searchParams.set("microsoft", "error");
      redirectBase.searchParams.set("message", input.errorDescription ?? input.error);
      return redirectBase.toString();
    }

    if (!input.code || !input.state) {
      redirectBase.searchParams.set("microsoft", "error");
      redirectBase.searchParams.set("message", "Microsoft did not return the required authorization code.");
      return redirectBase.toString();
    }

    const state = await this.consumeState(input.state, user);
    const redirectUrl = new URL(state.redirect_to ?? "/setup/channels/email", env.FRONTEND_URL);

    try {
      const tokens = await this.exchangeCodeForTokens(input.code);
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new AppError("Microsoft did not return the required OAuth tokens.", 502, "microsoft_token_missing");
      }

      const profile = await this.fetchProfile(tokens.access_token);
      const email = normalizeEmail(profile.mail || profile.userPrincipalName || "");
      if (!email || !isValidEmail(email)) {
        throw new AppError("Microsoft account did not return a valid email address.", 400, "microsoft_profile_email_missing");
      }

      const displayName = profile.displayName?.trim() || email;
      const tenantId = decodeTenantId(tokens.id_token);
      const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? MICROSOFT_SCOPES;
      const expiresAt = tokenExpiryDate(tokens.expires_in);
      const sender = await this.upsertMicrosoftSender({
        organizationId: state.organization_id,
        userId: state.user_id,
        email,
        displayName,
        providerUserId: profile.id ?? null,
        tenantId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scopes
      });

      await this.auditLogService.record(user, {
        organizationId: state.organization_id,
        action: "email_sender.microsoft_connected",
        entityType: "email_sender",
        entityId: sender.id,
        metadata: {
          from_email: sender.from_email,
          provider_user_id: sender.oauth_provider_user_id,
          tenant_id: sender.oauth_tenant_id
        }
      });

      redirectUrl.searchParams.set("microsoft", "connected");
      redirectUrl.searchParams.set("email", email);
      return redirectUrl.toString();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect Microsoft account.";
      redirectUrl.searchParams.set("microsoft", "error");
      redirectUrl.searchParams.set("message", message);
      return redirectUrl.toString();
    }
  }

  async getStatus(user: AuthUser, input: { organizationId?: string | null }) {
    ensureSetupAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const result = await query<EmailSenderOAuthRow>(
      `
        select *
        from email_senders
        where organization_id = $1
          and sender_type = 'microsoft365'
        order by oauth_connected_at desc nulls last, created_at desc
        limit 1
      `,
      [organizationId]
    );

    const sender = result.rows[0];
    if (!sender) {
      return { connected: false, account: null };
    }

    return {
      connected: sender.status === "verified" && Boolean(sender.oauth_refresh_token_encrypted),
      account: this.toSafeStatus(sender)
    };
  }

  async disconnect(user: AuthUser, input: { organizationId?: string | null; senderId?: string | null }) {
    ensureSetupAccess(user);
    const organizationId = resolveOrganizationId(user, input.organizationId);
    const values: unknown[] = [organizationId];
    const senderFilter = input.senderId ? "and id = $2" : "";

    if (input.senderId) {
      values.push(input.senderId);
    }

    const result = await query<EmailSenderOAuthRow>(
      `
        update email_senders
        set status = 'disabled',
            oauth_access_token_encrypted = null,
            oauth_refresh_token_encrypted = null,
            oauth_token_expires_at = null,
            last_test_status = null,
            last_test_error = null
        where organization_id = $1
          and sender_type = 'microsoft365'
          ${senderFilter}
        returning *
      `,
      values
    );

    const sender = result.rows[0];
    if (!sender) {
      throw new AppError("Microsoft email connection not found", 404, "microsoft_connection_not_found");
    }

    await this.auditLogService.record(user, {
      organizationId,
      action: "email_sender.microsoft_disconnected",
      entityType: "email_sender",
      entityId: sender.id,
      metadata: {
        from_email: sender.from_email
      }
    });

    return this.toSafeStatus(sender);
  }

  async getValidMicrosoftAccessToken(senderId: string) {
    const result = await query<EmailSenderOAuthRow>(
      `
        select *
        from email_senders
        where id = $1
          and sender_type = 'microsoft365'
        limit 1
      `,
      [senderId]
    );

    const sender = result.rows[0];
    if (!sender) {
      throw new AppError("Microsoft sender not found", 404, "microsoft_sender_not_found");
    }

    return this.getValidMicrosoftAccessTokenForSender(sender);
  }

  async getValidMicrosoftAccessTokenForSender(sender: EmailSenderOAuthRow) {
    if (!sender.oauth_access_token_encrypted || !sender.oauth_refresh_token_encrypted || !sender.oauth_token_expires_at) {
      await this.markReconnectRequired(sender.id, "Microsoft account needs to be reconnected.");
      throw new AppError("Microsoft account needs to be reconnected.", 400, "microsoft_reconnect_required");
    }

    const expiresAt = new Date(sender.oauth_token_expires_at).getTime();
    if (expiresAt - Date.now() > ACCESS_TOKEN_REFRESH_WINDOW_MS) {
      return decryptEmailSecret(sender.oauth_access_token_encrypted);
    }

    return this.refreshMicrosoftAccessToken(sender);
  }

  async sendMicrosoftGraphEmail(input: {
    connectionId: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    htmlBody?: string | null;
    textBody?: string | null;
    replyTo?: string | null;
  }) {
    const to = validateEmailList(input.to, "to");
    const cc = validateEmailList(input.cc, "cc");
    const bcc = validateEmailList(input.bcc, "bcc");
    const replyTo = input.replyTo ? [validateEmail(input.replyTo, "reply_to")] : [];

    if (to.length === 0) {
      throw new AppError("At least one recipient is required", 400, "recipient_required");
    }

    const send = async (accessToken: string) => {
      const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: {
              contentType: input.htmlBody ? "HTML" : "Text",
              content: input.htmlBody ?? input.textBody ?? ""
            },
            toRecipients: to.map(buildRecipient),
            ccRecipients: cc.map(buildRecipient),
            bccRecipients: bcc.map(buildRecipient),
            replyTo: replyTo.map(buildRecipient)
          },
          saveToSentItems: true
        })
      });

      if (response.status === 202) {
        return { ok: true, messageId: null as string | null };
      }

      const body = await response.json().catch(() => null) as unknown;
      return { ok: false, status: response.status, body };
    };

    let accessToken = await this.getValidMicrosoftAccessToken(input.connectionId);
    let result = await send(accessToken);

    if (!result.ok && result.status === 401) {
      const sender = await this.getSenderById(input.connectionId);
      accessToken = await this.refreshMicrosoftAccessToken(sender);
      result = await send(accessToken);
    }

    if (!result.ok) {
      const status = result.status ?? 400;
      const message = microsoftSendError(status, result.body);
      await this.storeLastError(input.connectionId, message);
      throw new AppError(message, status === 429 ? 429 : 400, "microsoft_graph_send_failed");
    }

    await this.storeLastError(input.connectionId, null);
    return result;
  }

  private async consumeState(state: string, user: AuthUser) {
    const result = await withTransaction(async (client) => {
      const selected = await client.query<OAuthStateRow>(
        `
          select *
          from email_oauth_states
          where state = $1
          for update
        `,
        [state]
      );

      const row = selected.rows[0];
      if (!row) {
        throw new AppError("Microsoft connection state is invalid or expired.", 400, "microsoft_oauth_state_invalid");
      }

      if (row.provider !== "microsoft" || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
        throw new AppError("Microsoft connection state is invalid or expired.", 400, "microsoft_oauth_state_invalid");
      }

      if (user.role !== "super_admin" && row.organization_id !== user.organizationId) {
        throw new AppError("Organization scope mismatch", 403, "organization_scope_mismatch");
      }

      if (user.organizationUserId && row.user_id !== user.organizationUserId) {
        throw new AppError("Microsoft connection state is invalid or expired.", 400, "microsoft_oauth_state_invalid");
      }

      await client.query(
        `
          update email_oauth_states
          set consumed_at = timezone('utc', now())
          where state = $1
        `,
        [state]
      );

      return row;
    });

    return result;
  }

  private async exchangeCodeForTokens(code: string) {
    const response = await fetch(getMicrosoftTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: env.MICROSOFT_CLIENT_SECRET ?? "",
        code,
        redirect_uri: getRedirectUri(),
        grant_type: "authorization_code",
        scope: MICROSOFT_SCOPES.join(" ")
      })
    });

    const body = await response.json().catch(() => null) as MicrosoftTokenResponse | null;
    if (!response.ok || !body?.access_token) {
      throw new AppError(sanitizeMicrosoftError(body, "Unable to verify Microsoft authorization."), 502, "microsoft_token_exchange_failed");
    }

    return body;
  }

  private async fetchProfile(accessToken: string) {
    const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const body = await response.json().catch(() => null) as MicrosoftGraphProfile & { error?: { message?: string } } | null;
    if (!response.ok || !body) {
      throw new AppError(body?.error?.message ?? "Unable to fetch Microsoft profile.", 502, "microsoft_profile_failed");
    }

    return body;
  }

  private async upsertMicrosoftSender(input: {
    organizationId: string;
    userId: string;
    email: string;
    displayName: string;
    providerUserId: string | null;
    tenantId: string | null;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scopes: string[];
  }) {
    const result = await query<EmailSenderOAuthRow>(
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
          oauth_provider,
          oauth_account_email,
          oauth_provider_user_id,
          oauth_tenant_id,
          oauth_access_token_encrypted,
          oauth_refresh_token_encrypted,
          oauth_token_expires_at,
          oauth_scopes,
          oauth_connected_at,
          status,
          last_test_status,
          last_test_error,
          last_test_at,
          created_by_user_id
        ) values (
          $1, 'microsoft365', $2, $2, $3, null, null, null, false, null, null,
          'microsoft', $3, $4, $5, $6, $7, $8, $9, timezone('utc', now()),
          'verified', 'success', null, timezone('utc', now()), $10
        )
        on conflict (organization_id, sender_type, lower(from_email))
        where sender_type = 'microsoft365'
        do update set
          display_name = excluded.display_name,
          from_name = excluded.from_name,
          from_email = excluded.from_email,
          smtp_host = null,
          smtp_port = null,
          smtp_username = null,
          smtp_password_encrypted = null,
          oauth_provider = 'microsoft',
          oauth_account_email = excluded.oauth_account_email,
          oauth_provider_user_id = excluded.oauth_provider_user_id,
          oauth_tenant_id = excluded.oauth_tenant_id,
          oauth_access_token_encrypted = excluded.oauth_access_token_encrypted,
          oauth_refresh_token_encrypted = excluded.oauth_refresh_token_encrypted,
          oauth_token_expires_at = excluded.oauth_token_expires_at,
          oauth_scopes = excluded.oauth_scopes,
          oauth_connected_at = excluded.oauth_connected_at,
          status = 'verified',
          last_test_status = 'success',
          last_test_error = null,
          last_test_at = timezone('utc', now())
        returning *
      `,
      [
        input.organizationId,
        input.displayName,
        input.email,
        input.providerUserId,
        input.tenantId,
        encryptEmailSecret(input.accessToken),
        encryptEmailSecret(input.refreshToken),
        input.expiresAt.toISOString(),
        input.scopes,
        input.userId
      ]
    );

    return result.rows[0];
  }

  private async refreshMicrosoftAccessToken(sender: EmailSenderOAuthRow) {
    if (!sender.oauth_refresh_token_encrypted) {
      await this.markReconnectRequired(sender.id, "Microsoft account needs to be reconnected.");
      throw new AppError("Microsoft account needs to be reconnected.", 400, "microsoft_reconnect_required");
    }

    const response = await fetch(getMicrosoftTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: env.MICROSOFT_CLIENT_SECRET ?? "",
        refresh_token: decryptEmailSecret(sender.oauth_refresh_token_encrypted),
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES.join(" ")
      })
    });

    const body = await response.json().catch(() => null) as MicrosoftTokenResponse | null;
    if (!response.ok || !body?.access_token) {
      const message = sanitizeMicrosoftError(body, "Microsoft account needs to be reconnected.");
      await this.markReconnectRequired(sender.id, message);
      throw new AppError(
        body?.error === "invalid_grant" ? "Microsoft account needs to be reconnected." : message,
        400,
        "microsoft_reconnect_required"
      );
    }

    const nextRefreshToken = body.refresh_token ?? decryptEmailSecret(sender.oauth_refresh_token_encrypted);
    const expiresAt = tokenExpiryDate(body.expires_in);

    await query(
      `
        update email_senders
        set oauth_access_token_encrypted = $2,
            oauth_refresh_token_encrypted = $3,
            oauth_token_expires_at = $4,
            oauth_scopes = $5,
            status = 'verified',
            last_test_error = null
        where id = $1
      `,
      [
        sender.id,
        encryptEmailSecret(body.access_token),
        encryptEmailSecret(nextRefreshToken),
        expiresAt.toISOString(),
        body.scope?.split(/\s+/).filter(Boolean) ?? sender.oauth_scopes ?? MICROSOFT_SCOPES
      ]
    );

    return body.access_token;
  }

  private async getSenderById(senderId: string) {
    const result = await query<EmailSenderOAuthRow>(
      `
        select *
        from email_senders
        where id = $1
          and sender_type = 'microsoft365'
        limit 1
      `,
      [senderId]
    );

    const sender = result.rows[0];
    if (!sender) {
      throw new AppError("Microsoft sender not found", 404, "microsoft_sender_not_found");
    }

    return sender;
  }

  private async markReconnectRequired(senderId: string, message: string) {
    await query(
      `
        update email_senders
        set status = 'reconnect_required',
            last_test_status = 'failed',
            last_test_error = $2
        where id = $1
      `,
      [senderId, message]
    );
  }

  private async storeLastError(senderId: string, message: string | null) {
    await query(
      `
        update email_senders
        set last_test_error = $2,
            last_test_status = case when $2::text is null then last_test_status else 'failed' end,
            status = case when $2::text is null and status = 'failed' then 'verified' else status end
        where id = $1
      `,
      [senderId, message]
    );
  }

  private toSafeStatus(sender: EmailSenderOAuthRow) {
    return {
      id: sender.id,
      email: sender.from_email,
      display_name: sender.display_name,
      status: sender.status,
      connected_at: sender.oauth_connected_at,
      token_expires_at: sender.oauth_token_expires_at,
      last_error: sender.last_test_error
    };
  }
}
