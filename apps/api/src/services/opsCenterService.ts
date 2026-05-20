import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { ProjectionService } from "./projectionService.js";

type HealthStatus = "healthy" | "warning" | "critical";
type RawEventStatus = "pending" | "processing" | "failed" | "ignored" | "processed";
type OutboxStatus = "pending" | "processing" | "failed" | "dispatched";
type ProjectionScope = "organization" | "conversation" | "contact";

const CONNECTOR_LEASE_STALE_MINUTES = 3;
const RAW_EVENT_STALE_MINUTES = Math.ceil(env.RAW_EVENT_WORKER_STALE_AFTER_MS / 60000);
const OUTBOX_STALE_MINUTES = Math.ceil(env.MESSAGE_OUTBOX_WORKER_STALE_AFTER_MS / 60000);
const HIGH_PENDING_THRESHOLD = 100;

export class OpsCenterService {
  constructor(private readonly projectionService = new ProjectionService()) {}

  async getSummary() {
    const client = await pool.connect();

    try {
      const [orgTotals, accountTotals, rawTotals, outboxTotals, campaignTotals, activityTotals] = await Promise.all([
        client.query<{ total_organizations: string }>("select count(*)::text as total_organizations from organizations"),
        client.query<{
          total_active_whatsapp_accounts: string;
          disconnected_whatsapp_accounts: string;
          stale_connector_leases: string;
        }>(
          `
            select
              count(*) filter (where lower(coalesce(connection_status, 'new')) in ('connected', 'open', 'ready', 'reconnecting'))::text as total_active_whatsapp_accounts,
              count(*) filter (where lower(coalesce(connection_status, 'new')) not in ('connected', 'open', 'ready'))::text as disconnected_whatsapp_accounts,
              count(*) filter (
                where connector_owner_id is not null
                  and (
                    connector_heartbeat_at is null
                    or connector_heartbeat_at < timezone('utc', now()) - ($1::text::interval)
                  )
              )::text as stale_connector_leases
            from whatsapp_accounts
          `,
          [`${CONNECTOR_LEASE_STALE_MINUTES} minutes`]
        ),
        client.query<{ pending: string; failed: string; processing: string }>(
          `
            select
              count(*) filter (where processing_status = 'pending')::text as pending,
              count(*) filter (where processing_status = 'failed')::text as failed,
              count(*) filter (where processing_status = 'processing')::text as processing
            from raw_channel_events
          `
        ),
        client.query<{ pending: string; failed: string; processing: string }>(
          `
            select
              count(*) filter (where processing_status = 'pending')::text as pending,
              count(*) filter (where processing_status = 'failed')::text as failed,
              count(*) filter (where processing_status = 'processing')::text as processing
            from message_dispatch_outbox
          `
        ),
        client.query<{ pending: string; failed: string }>(
          `
            select
              count(*) filter (where send_status in ('pending', 'queued'))::text as pending,
              count(*) filter (where send_status = 'failed')::text as failed
            from campaign_recipients
          `
        ),
        client.query<{ latest_inbound_message_at: string | null; latest_outbound_message_at: string | null }>(
          `
            select
              max(sent_at) filter (where direction = 'incoming') as latest_inbound_message_at,
              max(sent_at) filter (where direction = 'outgoing') as latest_outbound_message_at
            from messages
          `
        )
      ]);

      const raw = rawTotals.rows[0] ?? { pending: "0", failed: "0", processing: "0" };
      const outbox = outboxTotals.rows[0] ?? { pending: "0", failed: "0", processing: "0" };
      const campaigns = campaignTotals.rows[0] ?? { pending: "0", failed: "0" };
      const accounts = accountTotals.rows[0] ?? {
        total_active_whatsapp_accounts: "0",
        disconnected_whatsapp_accounts: "0",
        stale_connector_leases: "0"
      };
      const latestInbound = activityTotals.rows[0]?.latest_inbound_message_at ?? null;
      const latestOutbound = activityTotals.rows[0]?.latest_outbound_message_at ?? null;
      const activeAccounts = Number(accounts.total_active_whatsapp_accounts);
      const hasNoRecentActivity =
        activeAccounts > 0 && !isRecentWithinHours(latestInbound, 24) && !isRecentWithinHours(latestOutbound, 24);

      const systemHealthStatus = resolveSummaryHealth({
        failedRawEvents: Number(raw.failed),
        failedOutbox: Number(outbox.failed),
        staleConnectorLeases: Number(accounts.stale_connector_leases),
        pendingRawEvents: Number(raw.pending),
        pendingOutbox: Number(outbox.pending),
        campaignDispatchPending: Number(campaigns.pending),
        campaignDispatchFailed: Number(campaigns.failed),
        hasNoRecentActivity
      });

      return {
        total_organizations: Number(orgTotals.rows[0]?.total_organizations ?? 0),
        total_active_whatsapp_accounts: activeAccounts,
        disconnected_whatsapp_accounts: Number(accounts.disconnected_whatsapp_accounts),
        stale_connector_leases: Number(accounts.stale_connector_leases),
        raw_events_pending_count: Number(raw.pending),
        raw_events_failed_count: Number(raw.failed),
        raw_events_processing_count: Number(raw.processing),
        message_outbox_pending_count: Number(outbox.pending),
        message_outbox_failed_count: Number(outbox.failed),
        message_outbox_processing_count: Number(outbox.processing),
        campaign_dispatch_pending_count: Number(campaigns.pending),
        campaign_dispatch_failed_count: Number(campaigns.failed),
        latest_inbound_message_at: latestInbound,
        latest_outbound_message_at: latestOutbound,
        system_health_status: systemHealthStatus
      };
    } finally {
      client.release();
    }
  }

  async listConnectors() {
    const result = await pool.query<{
      organization_id: string;
      organization_name: string;
      whatsapp_account_id: string;
      display_name: string | null;
      label: string | null;
      phone_number: string | null;
      connection_status: string;
      connector_owner_id: string | null;
      connector_claimed_at: string | null;
      connector_heartbeat_at: string | null;
      last_connection_event: string | null;
      last_connection_event_at: string | null;
      is_lease_stale: boolean;
      last_inbound_at: string | null;
      last_outbound_at: string | null;
    }>(
      `
        select
          o.id as organization_id,
          o.name as organization_name,
          wa.id as whatsapp_account_id,
          wa.display_name,
          wa.label,
          wa.account_phone_e164 as phone_number,
          wa.connection_status,
          wa.connector_owner_id,
          wa.connector_claimed_at,
          wa.connector_heartbeat_at,
          event_latest.event_type as last_connection_event,
          event_latest.created_at as last_connection_event_at,
          (
            wa.connector_owner_id is not null
            and (
              wa.connector_heartbeat_at is null
              or wa.connector_heartbeat_at < timezone('utc', now()) - ($1::text::interval)
            )
          ) as is_lease_stale,
          msg_activity.last_inbound_at,
          msg_activity.last_outbound_at
        from whatsapp_accounts wa
        join organizations o on o.id = wa.organization_id
        left join lateral (
          select event_type, created_at
          from whatsapp_connection_events
          where whatsapp_account_id = wa.id
          order by created_at desc
          limit 1
        ) event_latest on true
        left join lateral (
          select
            max(sent_at) filter (where direction = 'incoming') as last_inbound_at,
            max(sent_at) filter (where direction = 'outgoing') as last_outbound_at
          from messages
          where whatsapp_account_id = wa.id
        ) msg_activity on true
        order by o.name asc, coalesce(wa.display_name, wa.label, wa.account_phone_e164, wa.id::text) asc
      `,
      [`${CONNECTOR_LEASE_STALE_MINUTES} minutes`]
    );

    return result.rows.map((row) => ({
      ...row,
      health_status: resolveConnectorHealth(row)
    }));
  }

  async listRawEvents(input: { organizationId?: string; status?: RawEventStatus; limit: number }) {
    const values: unknown[] = [];
    const conditions = ["1 = 1"];

    if (input.organizationId) {
      values.push(input.organizationId);
      conditions.push(`rce.organization_id = $${values.length}`);
    }

    if (input.status) {
      values.push(input.status);
      conditions.push(`rce.processing_status = $${values.length}`);
    }

    values.push(input.limit);

    const result = await pool.query(
      `
        select
          rce.id,
          rce.organization_id,
          o.name as organization_name,
          rce.source as channel,
          rce.event_type,
          rce.external_event_id as event_key,
          rce.processing_status as status,
          rce.retry_count as attempts,
          rce.error_message,
          rce.received_at as created_at,
          case when rce.processing_status in ('processed', 'ignored') then rce.event_timestamp else null end as processed_at,
          left(rce.payload::text, 1200) as payload_preview
        from raw_channel_events rce
        join organizations o on o.id = rce.organization_id
        where ${conditions.join(" and ")}
        order by rce.received_at desc, rce.id desc
        limit $${values.length}
      `,
      values
    );

    return result.rows;
  }

  async retryRawEvent(eventId: string) {
    return withTransaction(async (client) => {
      const existing = await client.query<{ processing_status: RawEventStatus; received_at: string }>(
        `
          select processing_status, received_at
          from raw_channel_events
          where id = $1
          for update
        `,
        [eventId]
      );
      const event = existing.rows[0];

      if (!event) {
        throw new AppError("Raw event not found", 404, "raw_event_not_found");
      }

      const isStuckProcessing =
        event.processing_status === "processing" &&
        new Date(event.received_at).getTime() < Date.now() - RAW_EVENT_STALE_MINUTES * 60_000;

      if (event.processing_status !== "failed" && !isStuckProcessing) {
        throw new AppError("Only failed or stale processing raw events can be retried", 400, "raw_event_not_retryable");
      }

      const updated = await client.query(
        `
          update raw_channel_events
          set processing_status = 'pending',
              error_message = null
          where id = $1
          returning *
        `,
        [eventId]
      );

      return updated.rows[0];
    });
  }

  async replayRawEvents(input: { organizationId: string; statuses: RawEventStatus[]; limit: number }) {
    return withTransaction(async (client) => {
      const result = await client.query<{ count: string }>(
        `
          with targeted as (
            select id
            from raw_channel_events
            where organization_id = $1
              and processing_status = any($2::text[])
            order by received_at asc
            limit $3
            for update skip locked
          ),
          updated as (
            update raw_channel_events rce
            set processing_status = 'pending',
                error_message = null
            from targeted
            where rce.id = targeted.id
            returning 1
          )
          select count(*)::text as count from updated
        `,
        [input.organizationId, input.statuses, input.limit]
      );

      return Number(result.rows[0]?.count ?? 0);
    });
  }

  async listOutbox(input: { organizationId?: string; status?: OutboxStatus; limit: number }) {
    const values: unknown[] = [];
    const conditions = ["1 = 1"];

    if (input.organizationId) {
      values.push(input.organizationId);
      conditions.push(`mdo.organization_id = $${values.length}`);
    }

    if (input.status) {
      values.push(input.status);
      conditions.push(`mdo.processing_status = $${values.length}`);
    }

    values.push(input.limit);

    const result = await pool.query(
      `
        select
          mdo.id,
          mdo.organization_id,
          o.name as organization_name,
          mdo.conversation_id,
          mdo.message_id,
          mdo.whatsapp_account_id,
          coalesce(wa.display_name, wa.label, wa.account_phone_e164, wa.id::text) as whatsapp_account_label,
          mdo.processing_status as status,
          mdo.attempt_count as attempts,
          mdo.last_error,
          mdo.created_at,
          mdo.updated_at,
          mdo.dispatched_at
        from message_dispatch_outbox mdo
        join organizations o on o.id = mdo.organization_id
        left join whatsapp_accounts wa on wa.id = mdo.whatsapp_account_id
        where ${conditions.join(" and ")}
        order by mdo.created_at desc, mdo.id desc
        limit $${values.length}
      `,
      values
    );

    return result.rows;
  }

  async retryOutboxJob(jobId: string) {
    return withTransaction(async (client) => {
      const existing = await client.query<{ processing_status: OutboxStatus; claimed_at: string | null; created_at: string }>(
        `
          select processing_status, claimed_at, created_at
          from message_dispatch_outbox
          where id = $1
          for update
        `,
        [jobId]
      );
      const job = existing.rows[0];

      if (!job) {
        throw new AppError("Outbox job not found", 404, "outbox_job_not_found");
      }

      const processingAnchor = job.claimed_at ?? job.created_at;
      const isStuckProcessing =
        job.processing_status === "processing" &&
        new Date(processingAnchor).getTime() < Date.now() - OUTBOX_STALE_MINUTES * 60_000;

      if (job.processing_status !== "failed" && !isStuckProcessing) {
        throw new AppError("Only failed or stale processing outbox jobs can be retried", 400, "outbox_job_not_retryable");
      }

      const updated = await client.query(
        `
          update message_dispatch_outbox
          set processing_status = 'pending',
              claimed_at = null,
              next_attempt_at = timezone('utc', now()),
              last_error = null,
              updated_at = timezone('utc', now())
          where id = $1
          returning *
        `,
        [jobId]
      );

      return updated.rows[0];
    });
  }

  async listCampaignDispatch(input: { organizationId?: string; status?: string; campaignId?: string; limit: number }) {
    const values: unknown[] = [];
    const conditions = ["1 = 1"];

    if (input.organizationId) {
      values.push(input.organizationId);
      conditions.push(`c.organization_id = $${values.length}`);
    }

    if (input.status) {
      values.push(input.status);
      conditions.push(`c.status = $${values.length}`);
    }

    if (input.campaignId) {
      values.push(input.campaignId);
      conditions.push(`c.id = $${values.length}`);
    }

    values.push(input.limit);

    const result = await pool.query(
      `
        select
          c.id as campaign_id,
          c.name as campaign_name,
          c.organization_id,
          o.name as organization_name,
          c.status,
          count(cr.id)::int as total_recipients,
          count(cr.id) filter (where cr.send_status in ('pending', 'queued'))::int as pending_count,
          count(cr.id) filter (where cr.send_status = 'queued' and cr.message_id is null)::int as processing_count,
          count(cr.id) filter (where cr.send_status = 'sent')::int as sent_count,
          count(cr.id) filter (where cr.send_status = 'failed')::int as failed_count,
          count(cr.id) filter (where cr.send_status = 'skipped')::int as skipped_count,
          c.created_at,
          null::timestamptz as started_at,
          null::timestamptz as completed_at,
          (
            array_remove(array_agg(cr.error_message order by cr.failed_at desc nulls last, cr.created_at desc), null)
          )[1] as last_error
        from campaigns c
        join organizations o on o.id = c.organization_id
        left join campaign_recipients cr on cr.campaign_id = c.id
        where ${conditions.join(" and ")}
        group by c.id, o.name
        order by c.created_at desc, c.id desc
        limit $${values.length}
      `,
      values
    );

    return result.rows;
  }

  async rebuildProjections(input: {
    organizationId: string;
    scope: ProjectionScope;
    conversationId?: string | null;
    contactId?: string | null;
  }) {
    return withTransaction(async (client) => {
      await assertOrganizationExists(client, input.organizationId);

      if (input.scope === "conversation") {
        if (!input.conversationId) {
          throw new AppError("conversationId is required for conversation rebuild", 400, "conversation_required");
        }

        await assertConversationInOrganization(client, input.organizationId, input.conversationId);
        await this.projectionService.refreshConversation(client, input.conversationId);
        return { rebuilt_conversations: 1, rebuilt_contacts: 0, rebuilt_dashboard_metrics: 0 };
      }

      if (input.scope === "contact") {
        if (!input.contactId) {
          throw new AppError("contactId is required for contact rebuild", 400, "contact_required");
        }

        await assertContactInOrganization(client, input.organizationId, input.contactId);
        await this.projectionService.refreshContact(client, input.contactId);
        return { rebuilt_conversations: 0, rebuilt_contacts: 1, rebuilt_dashboard_metrics: 0 };
      }

      const conversations = await client.query<{ id: string }>(
        "select id from conversations where organization_id = $1 order by updated_at desc nulls last, id desc limit 500",
        [input.organizationId]
      );
      const contacts = await client.query<{ id: string }>(
        "select id from contacts where organization_id = $1 order by updated_at desc nulls last, id desc limit 500",
        [input.organizationId]
      );
      const days = await client.query<{ metric_date: string }>(
        `
          select distinct date_trunc('day', sent_at)::date::text as metric_date
          from messages
          where organization_id = $1
            and sent_at is not null
          order by metric_date desc
          limit 31
        `,
        [input.organizationId]
      );

      for (const row of conversations.rows) {
        await this.projectionService.refreshConversation(client, row.id);
      }

      for (const row of contacts.rows) {
        await this.projectionService.refreshContact(client, row.id);
      }

      for (const row of days.rows) {
        await this.projectionService.refreshDashboardMetric(client, input.organizationId, new Date(row.metric_date));
      }

      return {
        rebuilt_conversations: conversations.rowCount ?? conversations.rows.length,
        rebuilt_contacts: contacts.rowCount ?? contacts.rows.length,
        rebuilt_dashboard_metrics: days.rowCount ?? days.rows.length,
        limited: conversations.rows.length >= 500 || contacts.rows.length >= 500
      };
    });
  }

  async listOrganizations() {
    const result = await pool.query<{
      organization_id: string;
      organization_name: string;
      active_whatsapp_account_count: string;
      stale_connector_leases: string;
      failed_raw_events_count: string;
      failed_outbox_count: string;
    }>(
      `
        select
          o.id as organization_id,
          o.name as organization_name,
          count(distinct wa.id) filter (where lower(coalesce(wa.connection_status, 'new')) in ('connected', 'open', 'ready', 'reconnecting'))::text as active_whatsapp_account_count,
          count(distinct wa.id) filter (
            where wa.connector_owner_id is not null
              and (
                wa.connector_heartbeat_at is null
                or wa.connector_heartbeat_at < timezone('utc', now()) - ($1::text::interval)
              )
          )::text as stale_connector_leases,
          count(distinct rce.id) filter (where rce.processing_status = 'failed')::text as failed_raw_events_count,
          count(distinct mdo.id) filter (where mdo.processing_status = 'failed')::text as failed_outbox_count
        from organizations o
        left join whatsapp_accounts wa on wa.organization_id = o.id
        left join raw_channel_events rce on rce.organization_id = o.id
        left join message_dispatch_outbox mdo on mdo.organization_id = o.id
        group by o.id, o.name
        order by o.name asc
      `,
      [`${CONNECTOR_LEASE_STALE_MINUTES} minutes`]
    );

    return result.rows.map((row) => ({
      ...row,
      active_whatsapp_account_count: Number(row.active_whatsapp_account_count),
      failed_raw_events_count: Number(row.failed_raw_events_count),
      failed_outbox_count: Number(row.failed_outbox_count),
      health_status:
        Number(row.stale_connector_leases) > 0 || Number(row.failed_raw_events_count) > 50 || Number(row.failed_outbox_count) > 20
          ? "critical"
          : Number(row.failed_raw_events_count) > 0 || Number(row.failed_outbox_count) > 0
            ? "warning"
            : "healthy"
    }));
  }
}

function resolveSummaryHealth(input: {
  failedRawEvents: number;
  failedOutbox: number;
  staleConnectorLeases: number;
  pendingRawEvents: number;
  pendingOutbox: number;
  campaignDispatchPending: number;
  campaignDispatchFailed: number;
  hasNoRecentActivity: boolean;
}): HealthStatus {
  if (
    input.failedRawEvents > 50 ||
    input.failedOutbox > 20 ||
    input.staleConnectorLeases > 0 ||
    input.hasNoRecentActivity
  ) {
    return "critical";
  }

  if (
    input.failedRawEvents > 0 ||
    input.failedOutbox > 0 ||
    input.campaignDispatchFailed > 0 ||
    input.pendingRawEvents > HIGH_PENDING_THRESHOLD ||
    input.pendingOutbox > HIGH_PENDING_THRESHOLD ||
    input.campaignDispatchPending > HIGH_PENDING_THRESHOLD
  ) {
    return "warning";
  }

  return "healthy";
}

function resolveConnectorHealth(row: {
  connection_status: string;
  is_lease_stale: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}): HealthStatus {
  const status = row.connection_status.toLowerCase();

  if (row.is_lease_stale || ["error", "logged_out", "banned"].includes(status)) {
    return "critical";
  }

  if (!["connected", "open", "ready"].includes(status) || (!isRecentWithinHours(row.last_inbound_at, 24) && !isRecentWithinHours(row.last_outbound_at, 24))) {
    return "warning";
  }

  return "healthy";
}

function isRecentWithinHours(value: string | null, hours: number) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= hours * 60 * 60 * 1000;
}

async function assertOrganizationExists(client: PoolClient, organizationId: string) {
  const result = await client.query("select 1 from organizations where id = $1 limit 1", [organizationId]);

  if (result.rowCount === 0) {
    throw new AppError("Organization not found", 404, "organization_not_found");
  }
}

async function assertConversationInOrganization(client: PoolClient, organizationId: string, conversationId: string) {
  const result = await client.query("select 1 from conversations where id = $1 and organization_id = $2 limit 1", [
    conversationId,
    organizationId
  ]);

  if (result.rowCount === 0) {
    throw new AppError("Conversation not found for organization", 404, "conversation_not_found");
  }
}

async function assertContactInOrganization(client: PoolClient, organizationId: string, contactId: string) {
  const result = await client.query("select 1 from contacts where id = $1 and organization_id = $2 limit 1", [
    contactId,
    organizationId
  ]);

  if (result.rowCount === 0) {
    throw new AppError("Contact not found for organization", 404, "contact_not_found");
  }
}
