import { query, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";

type SyncJobType = "contacts_sync" | "history_backfill" | "full_sync";
type SyncJobStatus = "queued" | "running" | "receiving_events" | "processing_events" | "idle" | "completed" | "failed" | "cancelled";

const ACTIVE_STATUSES: SyncJobStatus[] = ["queued", "running", "receiving_events", "processing_events"];
const IDLE_AFTER_MS = 120_000;

function canManageOrganization(authUser: AuthUser, organizationId: string) {
  return authUser.role === "super_admin" || authUser.organizationId === organizationId;
}

export class WhatsAppSyncJobService {
  async createJob(input: {
    authUser: AuthUser;
    organizationId: string;
    whatsappAccountId: string;
    jobType: SyncJobType;
    lookbackDays: number | null;
  }) {
    if (!canManageOrganization(input.authUser, input.organizationId)) {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    return withTransaction(async (client) => {
      const result = await client.query(
        `insert into whatsapp_sync_jobs (
          organization_id,
          whatsapp_account_id,
          requested_by,
          job_type,
          lookback_days,
          status,
          started_at,
          last_activity_at
        ) values ($1, $2, $3, $4, $5, 'running', now(), now())
        returning *`,
        [
          input.organizationId,
          input.whatsappAccountId,
          input.authUser.organizationUserId ?? null,
          input.jobType,
          input.lookbackDays
        ]
      );

      return result.rows[0];
    });
  }

  async getJob(authUser: AuthUser, jobId: string) {
    const result = await query(
      `select * from whatsapp_sync_jobs where id = $1`,
      [jobId]
    );

    const job = result.rows[0];

    if (!job) {
      throw new AppError("WhatsApp sync job not found", 404, "whatsapp_sync_job_not_found");
    }

    if (!canManageOrganization(authUser, job.organization_id)) {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    return this.refreshJobCounters(job);
  }

  async getLatestJobForAccount(authUser: AuthUser, accountId: string) {
    const result = await query(
      `select * from whatsapp_sync_jobs
       where whatsapp_account_id = $1
       order by created_at desc
       limit 1`,
      [accountId]
    );

    const job = result.rows[0];

    if (!job) {
      return null;
    }

    if (!canManageOrganization(authUser, job.organization_id)) {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    return this.refreshJobCounters(job);
  }

  private async refreshJobCounters(job: any) {
    const startedAt = job.started_at ?? job.created_at;
    const counters = await query(
      `select
        (select count(*)::int from raw_channel_events r
          where r.organization_id = $1
            and r.whatsapp_account_id = $2
            and r.received_at >= $3) as raw_events_received,
        (select count(*)::int from raw_channel_events r
          where r.organization_id = $1
            and r.whatsapp_account_id = $2
            and r.received_at >= $3
            and r.processing_status = 'failed') as failed_events,
        (select max(r.received_at) from raw_channel_events r
          where r.organization_id = $1
            and r.whatsapp_account_id = $2
            and r.received_at >= $3) as last_raw_event_at,
        (select count(*)::int from messages m
          where m.organization_id = $1
            and m.whatsapp_account_id = $2
            and m.created_at >= $3) as messages_processed,
        (select count(*)::int from conversations c
          where c.organization_id = $1
            and c.whatsapp_account_id = $2
            and c.updated_at >= $3) as conversations_updated`,
      [job.organization_id, job.whatsapp_account_id, startedAt]
    );

    const row = counters.rows[0] ?? {};
    const lastActivityAt = row.last_raw_event_at ?? job.last_activity_at ?? startedAt;
    const currentStatus = job.status as SyncJobStatus;
    const hasEvents = Number(row.raw_events_received ?? 0) > 0;
    const hasFailed = Number(row.failed_events ?? 0) > 0;
    const lastActivityMs = lastActivityAt ? new Date(lastActivityAt).getTime() : new Date(startedAt).getTime();
    const idle = Date.now() - lastActivityMs > IDLE_AFTER_MS;

    let nextStatus: SyncJobStatus = currentStatus;

    if (ACTIVE_STATUSES.includes(currentStatus)) {
      if (hasEvents && !idle) {
        nextStatus = "receiving_events";
      } else if (idle) {
        nextStatus = hasFailed ? "idle" : "completed";
      } else {
        nextStatus = "running";
      }
    }

    const completedAt = ["completed", "idle", "failed", "cancelled"].includes(nextStatus)
      ? job.completed_at ?? new Date().toISOString()
      : null;

    const updated = await query(
      `update whatsapp_sync_jobs
       set status = $1,
           raw_events_received = $2,
           messages_processed = $3,
           conversations_updated = $4,
           failed_events = $5,
           last_activity_at = $6,
           completed_at = $7
       where id = $8
       returning *`,
      [
        nextStatus,
        row.raw_events_received ?? 0,
        row.messages_processed ?? 0,
        row.conversations_updated ?? 0,
        row.failed_events ?? 0,
        lastActivityAt,
        completedAt,
        job.id
      ]
    );

    return updated.rows[0];
  }
}
