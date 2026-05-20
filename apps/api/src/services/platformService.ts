import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { AuditLogService } from "./auditLogService.js";
import { MessageDispatchService } from "./messageDispatchService.js";
import { MessageDispatchOutboxRepository } from "../repositories/messageDispatchOutboxRepository.js";
import { withTransaction } from "../config/database.js";
import { UsageAggregationService } from "./usageAggregationService.js";
import { OrganizationAdminRepository } from "../repositories/organizationAdminRepository.js";

type ServiceHealthStatus = "healthy" | "degraded" | "down" | "unknown";
type ServiceHealthKind = "application" | "provider" | "database" | "worker";

interface ServiceHealthCheck {
  id: string;
  label: string;
  provider: "CRM" | "Railway" | "Vercel" | "Supabase";
  kind: ServiceHealthKind;
  status: ServiceHealthStatus;
  message: string;
  checked_at: string;
  latency_ms: number | null;
  target_url: string | null;
}

interface ServiceHealthSummary {
  checked_at: string;
  overall_status: ServiceHealthStatus;
  services: ServiceHealthCheck[];
}

interface StatusPageSummary {
  status?: {
    indicator?: string;
    description?: string;
  };
}

const SERVICE_HEALTH_CACHE_MS = 60_000;
const SERVICE_HEALTH_TIMEOUT_MS = 5_000;

export class PlatformService {
  private serviceHealthCache: { expiresAt: number; value: ServiceHealthSummary } | null = null;

  constructor(
    private readonly usageAggregationService = new UsageAggregationService(),
    private readonly auditLogService = new AuditLogService(),
    private readonly messageDispatchOutboxRepository = new MessageDispatchOutboxRepository(),
    private readonly messageDispatchService = new MessageDispatchService(),
    private readonly organizationRepository = new OrganizationAdminRepository()
  ) {}

  async listOrganizations() {
    const client = await pool.connect();
    try {
      return this.organizationRepository.list(client);
    } finally {
      client.release();
    }
  }

  async getUsageSummary() {
    const client = await pool.connect();
    try {
      const usageResult = await client.query<{
        organization_id: string;
        usage_date: string;
        inbound_messages: number;
        outbound_messages: number;
        active_contacts: number;
        connected_whatsapp_accounts: number;
      }>(
        `
          select
            organization_id,
            usage_date,
            inbound_messages,
            outbound_messages,
            active_contacts,
            connected_whatsapp_accounts
          from usage_daily
          order by usage_date desc, organization_id asc
          limit 30
        `
      );

      const totalsResult = await client.query<{
        inbound_messages: string;
        outbound_messages: string;
        active_contacts: string;
        connected_whatsapp_accounts: string;
      }>(
        `
          select
            coalesce(sum(inbound_messages), 0)::text as inbound_messages,
            coalesce(sum(outbound_messages), 0)::text as outbound_messages,
            coalesce(sum(active_contacts), 0)::text as active_contacts,
            coalesce(sum(connected_whatsapp_accounts), 0)::text as connected_whatsapp_accounts
          from usage_daily
        `
      );

      return {
        totals: totalsResult.rows[0] ?? {
          inbound_messages: "0",
          outbound_messages: "0",
          active_contacts: "0",
          connected_whatsapp_accounts: "0"
        },
        daily: usageResult.rows
      };
    } finally {
      client.release();
    }
  }

  async getHealthSummary() {
    return this.usageAggregationService.getConnectorDiagnostics();
  }

  async getServiceHealthSummary(): Promise<ServiceHealthSummary> {
    const now = Date.now();

    if (this.serviceHealthCache && this.serviceHealthCache.expiresAt > now) {
      return this.serviceHealthCache.value;
    }

    const services = await Promise.all([
      this.checkHttpService({
        id: "crm-api",
        label: "CRM API",
        provider: "Railway",
        kind: "application",
        url: new URL("/api/health", env.API_PUBLIC_URL).toString()
      }),
      this.checkHttpService({
        id: "whatsapp-connector",
        label: "WhatsApp connector",
        provider: "Railway",
        kind: "application",
        url: new URL("/health", env.CONNECTOR_BASE_URL).toString()
      }),
      this.checkHttpService({
        id: "frontend",
        label: "Vercel frontend",
        provider: "Vercel",
        kind: "application",
        url: env.FRONTEND_URL
      }),
      this.checkDatabaseHealth(),
      this.checkWorkerQueueHealth(),
      this.checkStatusPage({
        id: "railway-status",
        label: "Railway status",
        provider: "Railway",
        url: "https://status.railway.com/api/v2/summary.json"
      }),
      this.checkStatusPage({
        id: "vercel-status",
        label: "Vercel status",
        provider: "Vercel",
        url: "https://www.vercel-status.com/api/v2/summary.json"
      }),
      this.checkStatusPage({
        id: "supabase-status",
        label: "Supabase status",
        provider: "Supabase",
        url: "https://status.supabase.com/api/v2/summary.json"
      })
    ]);

    const summary = {
      checked_at: new Date().toISOString(),
      overall_status: this.resolveOverallServiceStatus(services),
      services
    };

    this.serviceHealthCache = {
      expiresAt: now + SERVICE_HEALTH_CACHE_MS,
      value: summary
    };

    return summary;
  }

  async getAuditSummary(limit = 100) {
    return this.auditLogService.list({ limit });
  }

  async getOutboundDispatchSummary(limit = 25) {
    const client = await pool.connect();

    try {
      const totalsResult = await client.query<{
        pending: string;
        processing: string;
        failed: string;
        dispatched_today: string;
      }>(
        `
          select
            count(*) filter (where processing_status = 'pending')::text as pending,
            count(*) filter (where processing_status = 'processing')::text as processing,
            count(*) filter (where processing_status = 'failed')::text as failed,
            count(*) filter (
              where processing_status = 'dispatched'
                and dispatched_at >= date_trunc('day', timezone('utc', now()))
            )::text as dispatched_today
          from message_dispatch_outbox
        `
      );

      const receiptTotalsResult = await client.query<{
        pending: string;
        server_ack: string;
        device_delivered: string;
        read: string;
        played: string;
        failed: string;
      }>(
        `
          select
            count(*) filter (where direction = 'outgoing' and ack_status = 'pending')::text as pending,
            count(*) filter (where direction = 'outgoing' and ack_status = 'server_ack')::text as server_ack,
            count(*) filter (where direction = 'outgoing' and ack_status = 'device_delivered')::text as device_delivered,
            count(*) filter (where direction = 'outgoing' and ack_status = 'read')::text as read,
            count(*) filter (where direction = 'outgoing' and ack_status = 'played')::text as played,
            count(*) filter (where direction = 'outgoing' and ack_status = 'failed')::text as failed
          from messages
        `
      );

      const receiptsResult = await client.query<{
        id: string;
        organization_id: string;
        conversation_id: string;
        whatsapp_account_id: string;
        external_message_id: string;
        external_chat_id: string | null;
        content_text: string | null;
        ack_status: "pending" | "server_ack" | "device_delivered" | "read" | "played" | "failed";
        sent_at: string;
        delivered_at: string | null;
        read_at: string | null;
      }>(
        `
          select
            id,
            organization_id,
            conversation_id,
            whatsapp_account_id,
            external_message_id,
            external_chat_id,
            content_text,
            ack_status,
            sent_at,
            delivered_at,
            read_at
          from messages
          where direction = 'outgoing'
          order by coalesce(read_at, delivered_at, sent_at) desc, id desc
          limit $1
        `,
        [limit]
      );

      const jobsResult = await client.query<{
        id: string;
        organization_id: string;
        message_id: string;
        whatsapp_account_id: string;
        recipient_jid: string;
        processing_status: "pending" | "processing" | "dispatched" | "failed";
        attempt_count: number;
        last_attempt_at: string | null;
        next_attempt_at: string | null;
        dispatched_at: string | null;
        connector_message_id: string | null;
        last_error: string | null;
        created_at: string;
      }>(
        `
          select
            id,
            organization_id,
            message_id,
            whatsapp_account_id,
            recipient_jid,
            processing_status,
            attempt_count,
            last_attempt_at,
            next_attempt_at,
            dispatched_at,
            connector_message_id,
            last_error,
            created_at
          from message_dispatch_outbox
          order by created_at desc
          limit $1
        `,
        [limit]
      );

      return {
        totals: totalsResult.rows[0] ?? {
          pending: "0",
          processing: "0",
          failed: "0",
          dispatched_today: "0"
        },
        receipts_totals: receiptTotalsResult.rows[0] ?? {
          pending: "0",
          server_ack: "0",
          device_delivered: "0",
          read: "0",
          played: "0",
          failed: "0"
        },
        receipts: receiptsResult.rows,
        jobs: jobsResult.rows
      };
    } finally {
      client.release();
    }
  }

  async retryOutboundDispatch(input: {
    outboxIds?: string[];
    limit?: number;
    processNow?: boolean;
  }) {
    let outboxIds: string[] = [];

    const retried = await withTransaction(async (client) => {
      if (input.outboxIds && input.outboxIds.length > 0) {
        outboxIds = input.outboxIds;
        return this.messageDispatchOutboxRepository.requeueByIds(client, input.outboxIds);
      }

      const failed = await this.messageDispatchOutboxRepository.listFailed(client, input.limit ?? 25);
      outboxIds = failed.map((job) => job.id);
      return this.messageDispatchOutboxRepository.requeueByIds(client, outboxIds);
    });

    let processed = 0;

    if (input.processNow && retried > 0) {
      for (const outboxId of outboxIds) {
        const didProcess = await this.messageDispatchService.drainOne(outboxId);
        processed += didProcess.ok ? 1 : 0;
      }
    }

    return {
      retried,
      processed,
      outboxIds
    };
  }

  private async checkHttpService(input: {
    id: string;
    label: string;
    provider: ServiceHealthCheck["provider"];
    kind: ServiceHealthKind;
    url: string;
  }): Promise<ServiceHealthCheck> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      const response = await fetchWithTimeout(input.url, { method: "GET" }, SERVICE_HEALTH_TIMEOUT_MS);
      const latencyMs = Date.now() - startedAt;

      if (response.ok) {
        return {
          id: input.id,
          label: input.label,
          provider: input.provider,
          kind: input.kind,
          status: "healthy",
          message: `Reachable with HTTP ${response.status}`,
          checked_at: checkedAt,
          latency_ms: latencyMs,
          target_url: input.url
        };
      }

      return {
        id: input.id,
        label: input.label,
        provider: input.provider,
        kind: input.kind,
        status: response.status >= 500 ? "down" : "degraded",
        message: `Returned HTTP ${response.status}`,
        checked_at: checkedAt,
        latency_ms: latencyMs,
        target_url: input.url
      };
    } catch (error) {
      return {
        id: input.id,
        label: input.label,
        provider: input.provider,
        kind: input.kind,
        status: "down",
        message: getErrorMessage(error),
        checked_at: checkedAt,
        latency_ms: Date.now() - startedAt,
        target_url: input.url
      };
    }
  }

  private async checkStatusPage(input: {
    id: string;
    label: string;
    provider: ServiceHealthCheck["provider"];
    url: string;
  }): Promise<ServiceHealthCheck> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      const response = await fetchWithTimeout(input.url, { method: "GET" }, SERVICE_HEALTH_TIMEOUT_MS);
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        return {
          id: input.id,
          label: input.label,
          provider: input.provider,
          kind: "provider",
          status: response.status >= 500 ? "down" : "unknown",
          message: `Status page returned HTTP ${response.status}`,
          checked_at: checkedAt,
          latency_ms: latencyMs,
          target_url: input.url
        };
      }

      const payload = (await response.json()) as StatusPageSummary;
      const indicator = payload.status?.indicator ?? "unknown";

      return {
        id: input.id,
        label: input.label,
        provider: input.provider,
        kind: "provider",
        status: mapStatusPageIndicator(indicator),
        message: payload.status?.description ?? indicator,
        checked_at: checkedAt,
        latency_ms: latencyMs,
        target_url: input.url
      };
    } catch (error) {
      return {
        id: input.id,
        label: input.label,
        provider: input.provider,
        kind: "provider",
        status: "unknown",
        message: getErrorMessage(error),
        checked_at: checkedAt,
        latency_ms: Date.now() - startedAt,
        target_url: input.url
      };
    }
  }

  private async checkDatabaseHealth(): Promise<ServiceHealthCheck> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      await pool.query("select 1");

      return {
        id: "supabase-db",
        label: "Supabase database",
        provider: "Supabase",
        kind: "database",
        status: "healthy",
        message: "Database query succeeded",
        checked_at: checkedAt,
        latency_ms: Date.now() - startedAt,
        target_url: sanitizeDatabaseTarget(env.DATABASE_URL)
      };
    } catch (error) {
      return {
        id: "supabase-db",
        label: "Supabase database",
        provider: "Supabase",
        kind: "database",
        status: "down",
        message: getErrorMessage(error),
        checked_at: checkedAt,
        latency_ms: Date.now() - startedAt,
        target_url: sanitizeDatabaseTarget(env.DATABASE_URL)
      };
    }
  }

  private async checkWorkerQueueHealth(): Promise<ServiceHealthCheck> {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      const result = await pool.query<{
        stale_processing: string;
        failed: string;
        oldest_pending_age_seconds: string | null;
      }>(
        `
          with queue_state as (
            select
              count(*) filter (
                where processing_status = 'processing'
                  and coalesce(last_attempt_at, created_at) < now() - interval '10 minutes'
              )::text as stale_processing,
              count(*) filter (where processing_status = 'failed')::text as failed,
              min(created_at) filter (where processing_status = 'pending') as oldest_pending_at
            from message_dispatch_outbox
          )
          select
            stale_processing,
            failed,
            extract(epoch from now() - oldest_pending_at)::text as oldest_pending_age_seconds
          from queue_state
        `
      );

      const row = result.rows[0];
      const staleProcessing = Number(row?.stale_processing ?? 0);
      const failed = Number(row?.failed ?? 0);
      const oldestPendingAgeSeconds = Number(row?.oldest_pending_age_seconds ?? 0);
      const status: ServiceHealthStatus =
        staleProcessing > 0 || oldestPendingAgeSeconds > 600 ? "degraded" : failed > 0 ? "degraded" : "healthy";

      return {
        id: "message-outbox-worker",
        label: "Message outbox worker",
        provider: "Railway",
        kind: "worker",
        status,
        message:
          status === "healthy"
            ? "Queue is moving normally"
            : `${staleProcessing} stale processing, ${failed} failed, oldest pending ${Math.round(oldestPendingAgeSeconds)}s`,
        checked_at: checkedAt,
        latency_ms: Date.now() - startedAt,
        target_url: null
      };
    } catch (error) {
      return {
        id: "message-outbox-worker",
        label: "Message outbox worker",
        provider: "Railway",
        kind: "worker",
        status: "unknown",
        message: getErrorMessage(error),
        checked_at: checkedAt,
        latency_ms: Date.now() - startedAt,
        target_url: null
      };
    }
  }

  private resolveOverallServiceStatus(services: ServiceHealthCheck[]): ServiceHealthStatus {
    if (services.some((service) => service.status === "down")) {
      return "down";
    }

    if (services.some((service) => service.status === "degraded")) {
      return "degraded";
    }

    if (services.some((service) => service.status === "unknown")) {
      return "unknown";
    }

    return "healthy";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        ...init.headers
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mapStatusPageIndicator(indicator: string): ServiceHealthStatus {
  switch (indicator) {
    case "none":
      return "healthy";
    case "minor":
    case "major":
      return "degraded";
    case "critical":
      return "down";
    default:
      return "unknown";
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "Timed out" : error.message;
  }

  return "Unable to check service";
}

function sanitizeDatabaseTarget(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return null;
  }
}
