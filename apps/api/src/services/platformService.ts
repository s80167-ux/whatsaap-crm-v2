import { pool } from "../config/database.js";
import { AuditLogService } from "./auditLogService.js";
import { MessageDispatchService } from "./messageDispatchService.js";
import { MessageDispatchOutboxRepository } from "../repositories/messageDispatchOutboxRepository.js";
import { withTransaction } from "../config/database.js";
import { UsageAggregationService } from "./usageAggregationService.js";
import { OrganizationAdminRepository } from "../repositories/organizationAdminRepository.js";

export class PlatformService {
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
        processed += didProcess ? 1 : 0;
      }
    }

    return {
      retried,
      processed,
      outboxIds
    };
  }
}
