import type { PoolClient, QueryResult } from "pg";
import { pool } from "../config/database.js";
import { renderCampaignTemplateVariables } from "../modules/campaigns/campaignTemplateVariables.js";
import { CampaignSafetyService } from "./campaignSafetyService.js";
import { ConnectorClient } from "./connectorClient.js";

type Queryable = Pick<PoolClient, "query">;

type SenderRow = {
  whatsapp_account_id: string;
  connection_status: string;
  sender_label: string | null;
  sender_phone_number: string | null;
};

type CampaignHistoryRow = {
  has_history: boolean;
};

export type CampaignFailureClassification = {
  code:
    | "sender_banned"
    | "sender_suspected_ban"
    | "sender_logged_out"
    | "sender_disconnected"
    | "sender_unavailable"
    | "recipient_invalid"
    | "send_failed";
  reason: string;
  senderIssue: boolean;
  confirmedBanned: boolean;
};

export type CampaignSenderAvailability = {
  hasAvailableSender: boolean;
  senders: Array<{
    whatsappAccountId: string;
    dbStatus: string;
    liveStatus: string | null;
    available: boolean;
    senderLabel: string | null;
    senderPhoneNumber: string | null;
  }>;
  pauseCode: "sender_banned" | "suspected_sender_issue" | "sender_unavailable";
  pauseReason: string;
};

export const ACTIVE_SENDER_STATUSES = ["connected", "open", "ready"] as const;
export const BLOCKED_SENDER_STATUSES = [
  "banned",
  "suspected_ban",
  "logged_out",
  "disconnected",
  "reconnect_suppressed",
  "session_unavailable",
  "not_connected",
  "connection_closed",
  "unauthorized",
  "forbidden",
  "sender_unavailable"
] as const;
export const NON_RETRYABLE_SENDER_FAILURE_CODES = [
  "sender_banned",
  "sender_suspected_ban",
  "sender_logged_out",
  "sender_disconnected",
  "sender_unavailable",
  "suspected_sender_issue"
] as const;

const GENERIC_UNAVAILABLE_PAUSE_MESSAGE =
  "Campaign paused because the selected WhatsApp sender appears to be disconnected, logged out, or unavailable. Reconnect or replace the sender to resume.";
const CONFIRMED_BANNED_PAUSE_MESSAGE =
  "Campaign paused because the selected WhatsApp sender appears to be banned. Replace the sender to resume.";

function getQueryable(client?: PoolClient): Queryable {
  return client ?? pool;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return "Unable to send campaign message";
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "unknown";
}

export function isActiveSenderStatus(status: string | null | undefined) {
  return ACTIVE_SENDER_STATUSES.includes(normalizeStatus(status) as (typeof ACTIVE_SENDER_STATUSES)[number]);
}

export function isBlockedSenderStatus(status: string | null | undefined) {
  return BLOCKED_SENDER_STATUSES.includes(normalizeStatus(status) as (typeof BLOCKED_SENDER_STATUSES)[number]);
}

export function isSenderIssueFailureCode(code: string | null | undefined) {
  return NON_RETRYABLE_SENDER_FAILURE_CODES.includes(code as (typeof NON_RETRYABLE_SENDER_FAILURE_CODES)[number]);
}

export function classifyCampaignSendFailure(error: unknown): CampaignFailureClassification {
  const reason = toErrorMessage(error);
  const normalized = reason.toLowerCase();

  if (normalized.includes("invalid") && (normalized.includes("phone") || normalized.includes("jid"))) {
    return {
      code: "recipient_invalid",
      reason,
      senderIssue: false,
      confirmedBanned: false
    };
  }

  if (normalized.includes("banned")) {
    return {
      code: "sender_banned",
      reason,
      senderIssue: true,
      confirmedBanned: true
    };
  }

  if (normalized.includes("logged out")) {
    return {
      code: "sender_logged_out",
      reason,
      senderIssue: true,
      confirmedBanned: false
    };
  }

  if (normalized.includes("connection closed") || normalized.includes("closed connection")) {
    return {
      code: "sender_disconnected",
      reason,
      senderIssue: true,
      confirmedBanned: false
    };
  }

  if (
    normalized.includes("not connected") ||
    normalized.includes("session unavailable") ||
    normalized.includes("session is not connected") ||
    normalized.includes("sender unavailable") ||
    normalized.includes("did not reconnect before the send timeout")
  ) {
    return {
      code: "sender_unavailable",
      reason,
      senderIssue: true,
      confirmedBanned: false
    };
  }

  if (normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return {
      code: "sender_suspected_ban",
      reason,
      senderIssue: true,
      confirmedBanned: false
    };
  }

  return {
    code: "send_failed",
    reason,
    senderIssue: false,
    confirmedBanned: false
  };
}

export async function assessCampaignSenderAvailability(input: {
  organizationId: string;
  campaignId: string;
  connectorClient?: ConnectorClient;
  client?: PoolClient;
}) {
  const executor = getQueryable(input.client);
  const connectorClient = input.connectorClient ?? new ConnectorClient();
  const senderResult = await executor.query<SenderRow>(
    `
      with selected_senders as (
        select csa.whatsapp_account_id
        from campaign_sender_accounts csa
        where csa.organization_id = $1
          and csa.campaign_id = $2
          and csa.is_enabled = true
        union
        select c.sender_whatsapp_account_id
        from campaigns c
        where c.organization_id = $1
          and c.id = $2
          and c.sender_whatsapp_account_id is not null
      )
      select
        wa.id as whatsapp_account_id,
        lower(coalesce(wa.connection_status, 'disconnected')) as connection_status,
        coalesce(to_jsonb(wa)->>'label', to_jsonb(wa)->>'name', to_jsonb(wa)->>'display_name') as sender_label,
        coalesce(
          to_jsonb(wa)->>'account_phone_e164',
          to_jsonb(wa)->>'phone_number',
          to_jsonb(wa)->>'account_phone_normalized',
          to_jsonb(wa)->>'phone_number_normalized'
        ) as sender_phone_number
      from selected_senders ss
      join whatsapp_accounts wa
        on wa.organization_id = $1
       and wa.id = ss.whatsapp_account_id
      order by sender_label asc nulls last, sender_phone_number asc nulls last, wa.id asc
    `,
    [input.organizationId, input.campaignId]
  );

  const senders = [];
  let hasConfirmedBan = false;
  let hasSuspectedIssue = false;

  for (const row of senderResult.rows) {
    const dbStatus = normalizeStatus(row.connection_status);
    let liveStatus: string | null = null;
    let available = false;

    if (!isBlockedSenderStatus(dbStatus) && isActiveSenderStatus(dbStatus)) {
      try {
        const live = await connectorClient.getAccountStatus(row.whatsapp_account_id);
        liveStatus = normalizeStatus(live.connectionStatus);
        available = Boolean(live.connected) && isActiveSenderStatus(liveStatus);
        if (liveStatus === "banned") {
          hasConfirmedBan = true;
        } else if (!available) {
          hasSuspectedIssue = true;
        }
      } catch {
        hasSuspectedIssue = true;
      }
    } else {
      liveStatus = dbStatus;
    }

    if (dbStatus === "banned" || liveStatus === "banned") {
      hasConfirmedBan = true;
    }

    if (!available && (dbStatus === "suspected_ban" || dbStatus === "unauthorized" || dbStatus === "forbidden")) {
      hasSuspectedIssue = true;
    }

    senders.push({
      whatsappAccountId: row.whatsapp_account_id,
      dbStatus,
      liveStatus,
      available,
      senderLabel: row.sender_label,
      senderPhoneNumber: row.sender_phone_number
    });
  }

  const hasAvailableSender = senders.some((sender) => sender.available);
  return {
    hasAvailableSender,
    senders,
    pauseCode: hasConfirmedBan
      ? "sender_banned"
      : hasSuspectedIssue
        ? "suspected_sender_issue"
        : "sender_unavailable",
    pauseReason: hasConfirmedBan ? CONFIRMED_BANNED_PAUSE_MESSAGE : GENERIC_UNAVAILABLE_PAUSE_MESSAGE
  } satisfies CampaignSenderAvailability;
}

export async function pauseCampaignForSenderIssue(input: {
  organizationId: string;
  campaignId: string;
  pauseReason: string;
  client?: PoolClient;
}) {
  const executor = getQueryable(input.client);
  await CampaignSafetyService.ensureTables(executor as PoolClient);
  await executor.query(
    `
      update campaigns
      set status = 'paused',
          pause_reason = $3,
          updated_at = timezone('utc', now())
      where organization_id = $1
        and id = $2
        and status = 'sending'
    `,
    [input.organizationId, input.campaignId, input.pauseReason]
  );
}

export async function resetResumeSafeRecipients(input: {
  organizationId: string;
  campaignId: string;
  client?: PoolClient;
}) {
  const executor = getQueryable(input.client);
  await executor.query(
    `
      update campaign_recipients
      set send_status = 'pending',
          queued_at = null,
          next_attempt_at = timezone('utc', now()),
          error_message = null,
          failure_code = null,
          failure_reason = null
      where organization_id = $1
        and campaign_id = $2
        and send_status = 'queued'
        and message_id is null
    `,
    [input.organizationId, input.campaignId]
  );
}

export async function getCampaignHistoryState(input: {
  organizationId: string;
  campaignId: string;
  client?: PoolClient;
}) {
  const executor = getQueryable(input.client);
  const result = await executor.query<CampaignHistoryRow>(
    `
      select exists(
        select 1
        from campaign_recipients
        where organization_id = $1
          and campaign_id = $2
          and (
            send_status in ('sent', 'queued', 'failed', 'skipped')
            or attempt_count > 0
            or message_id is not null
          )
      ) as has_history
    `,
    [input.organizationId, input.campaignId]
  );

  return Boolean(result.rows[0]?.has_history);
}

export async function snapshotCampaignRecipientsSafely(input: {
  organizationId: string;
  campaignId: string;
  audienceGroupId: string;
  messageTemplate?: string | null;
  client?: PoolClient;
}) {
  const executor = getQueryable(input.client);
  const hasHistory = await getCampaignHistoryState(input);

  const result = await executor.query(
    hasHistory
      ? `
          with inserted as (
            insert into campaign_recipients (
              organization_id,
              campaign_id,
              audience_group_contact_id,
              crm_contact_id,
              name,
              phone_normalized,
              gender,
              salutation,
              tag,
              location,
              product_interest,
              customer_type,
              notes
            )
            select
              cac.organization_id,
              $2,
              cac.id,
              cac.crm_contact_id,
              cac.name,
              cac.phone_normalized,
              cac.gender,
              cac.salutation,
              cac.tag,
              cac.location,
              cac.product_interest,
              cac.customer_type,
              cac.notes
            from campaign_audience_contacts cac
            where cac.organization_id = $1
              and cac.audience_group_id = $3
              and cac.validation_status = 'valid'
              and cac.is_duplicate = false
              and cac.is_opted_out = false
              and not exists (
                select 1
                from campaign_recipients existing
                where existing.organization_id = $1
                  and existing.campaign_id = $2
                  and (
                    existing.audience_group_contact_id = cac.id
                    or existing.phone_normalized = cac.phone_normalized
                  )
              )
            returning audience_group_contact_id as id
          )
          select count(*)::int as affected_count from inserted
        `
      : `
          with deleted as (
            delete from campaign_recipients
            where organization_id = $1
              and campaign_id = $2
          ),
          inserted as (
            insert into campaign_recipients (
              organization_id,
              campaign_id,
              audience_group_contact_id,
              crm_contact_id,
              name,
              phone_normalized,
              gender,
              salutation,
              tag,
              location,
              product_interest,
              customer_type,
              notes
            )
            select
              organization_id,
              $2,
              id,
              crm_contact_id,
              name,
              phone_normalized,
              gender,
              salutation,
              tag,
              location,
              product_interest,
              customer_type,
              notes
            from campaign_audience_contacts
            where organization_id = $1
              and audience_group_id = $3
              and validation_status = 'valid'
              and is_duplicate = false
              and is_opted_out = false
            returning audience_group_contact_id as id
          )
          select count(*)::int as affected_count from inserted
        `,
    [input.organizationId, input.campaignId, input.audienceGroupId]
  );

  const affectedCount = Number((result.rows[0] as { affected_count?: number })?.affected_count ?? 0);

  if (input.messageTemplate?.trim()) {
    const recipients = await executor.query<{
      id: string;
      name: string | null;
      phone_normalized: string | null;
      gender: string | null;
      salutation: string | null;
      tag: string | null;
      location: string | null;
      product_interest: string | null;
      customer_type: string | null;
      notes: string | null;
    }>(
      `
        select
          id,
          name,
          phone_normalized,
          gender,
          salutation,
          tag,
          location,
          product_interest,
          customer_type,
          notes
        from campaign_recipients
        where organization_id = $1
          and campaign_id = $2
          and message_body_rendered is null
      `,
      [input.organizationId, input.campaignId]
    );

    for (const recipient of recipients.rows) {
      const messageBodyRendered = renderCampaignTemplateVariables(input.messageTemplate, {
        name: recipient.name,
        phone: recipient.phone_normalized,
        gender: recipient.gender,
        salutation: recipient.salutation,
        tag: recipient.tag,
        location: recipient.location,
        product_interest: recipient.product_interest,
        customer_type: recipient.customer_type,
        notes: recipient.notes
      });

      await executor.query(
        `
          update campaign_recipients
          set message_body_rendered = $4
          where organization_id = $1
            and campaign_id = $2
            and id = $3
        `,
        [input.organizationId, input.campaignId, recipient.id, messageBodyRendered]
      );
    }
  }

  return {
    hasHistory,
    affectedCount
  };
}

export async function retryFailedCampaignRecipients(input: {
  organizationId: string;
  campaignId: string;
  failureCodes?: string[];
  client?: PoolClient;
}) {
  const executor = getQueryable(input.client);
  const codes = (input.failureCodes ?? []).filter(Boolean);
  const codesFilter = codes.length > 0 ? "and failure_code = any($3::text[])" : "";
  const params: unknown[] = [input.organizationId, input.campaignId];
  if (codes.length > 0) {
    params.push(codes);
  }

  const result = await executor.query<{ retried_count: string }>(
    `
      with updated as (
        update campaign_recipients
        set send_status = 'pending',
            message_id = null,
            queued_at = null,
            sent_at = null,
            failed_at = null,
            next_attempt_at = timezone('utc', now()),
            attempt_count = 0,
            assigned_whatsapp_account_id = null,
            sender_assignment_reason = null,
            sender_assignment_index = null,
            sender_assigned_at = null,
            error_message = null,
            failure_code = null,
            failure_reason = null
        where organization_id = $1
          and campaign_id = $2
          and send_status = 'failed'
          ${codesFilter}
        returning id
      )
      select count(*)::text as retried_count from updated
    `,
    params
  );

  return Number(result.rows[0]?.retried_count ?? 0);
}
