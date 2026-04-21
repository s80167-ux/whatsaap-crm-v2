import { pool } from "../config/database.js";
import { AuditLogService } from "./auditLogService.js";
import { UsageAggregationService } from "./usageAggregationService.js";

export class PlatformService {
  constructor(
    private readonly usageAggregationService = new UsageAggregationService(),
    private readonly auditLogService = new AuditLogService()
  ) {}

  async listOrganizations() {
    const client = await pool.connect();
    try {
      const result = await client.query<{
        id: string;
        name: string;
        slug: string;
        status: string;
        created_at: string;
      }>(
        `
          select id, name, slug, status, created_at
          from organizations
          order by created_at desc
        `
      );

      return result.rows;
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
}
