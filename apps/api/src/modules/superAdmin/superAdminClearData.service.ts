import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../config/database.js";

type CountKey =
  | "users"
  | "whatsappAccounts"
  | "contacts"
  | "conversations"
  | "messages"
  | "sales"
  | "activities"
  | "notifications"
  | "repairProposals";

export type ClearOrganizationDataCounts = Record<CountKey, number>;

export type ClearOrganizationDataPreview = {
  organizationId: string;
  organizationName: string;
  counts: ClearOrganizationDataCounts;
  salesSummary: {
    totalOrders: number;
    openOrders: number;
    wonOrders: number;
    lostOrders: number;
    pipelineValue: number;
    wonValue: number;
    averageOrderValue: number;
  };
};

type OrganizationRecord = {
  id: string;
  name: string;
};

type CountRow = {
  count: string;
};

type SalesSummaryRow = {
  total_orders: string;
  open_orders: string;
  won_orders: string;
  lost_orders: string;
  pipeline_value: string;
  won_value: string;
  average_order_value: string;
};

const EMPTY_COUNTS: ClearOrganizationDataCounts = {
  users: 0,
  whatsappAccounts: 0,
  contacts: 0,
  conversations: 0,
  messages: 0,
  sales: 0,
  activities: 0,
  notifications: 0,
  repairProposals: 0
};

const COUNT_TABLES: Array<{ key: CountKey; tableName: string; columnName: string }> = [
  { key: "users", tableName: "organization_users", columnName: "organization_id" },
  { key: "whatsappAccounts", tableName: "whatsapp_accounts", columnName: "organization_id" },
  { key: "contacts", tableName: "contacts", columnName: "organization_id" },
  { key: "conversations", tableName: "conversations", columnName: "organization_id" },
  { key: "messages", tableName: "messages", columnName: "organization_id" },
  { key: "sales", tableName: "sales_orders", columnName: "organization_id" },
  { key: "activities", tableName: "activities", columnName: "organization_id" },
  { key: "notifications", tableName: "notifications", columnName: "organization_id" },
  { key: "repairProposals", tableName: "contact_repair_proposals", columnName: "organization_id" }
];

const CLEAR_TABLES: Array<{ key?: CountKey; tableName: string; columnName: string; excludeSuperAdminUsers?: boolean }> = [
  { tableName: "message_status_events", columnName: "message_id" },
  { tableName: "quick_reply_message_events", columnName: "organization_id" },
  { tableName: "message_dispatch_outbox", columnName: "organization_id" },
  { tableName: "message_outbox_receipts", columnName: "organization_id" },
  { tableName: "message_outbox_jobs", columnName: "organization_id" },
  { tableName: "sales_order_items", columnName: "sales_order_id" },
  { key: "notifications", tableName: "notifications", columnName: "organization_id" },
  { key: "activities", tableName: "activities", columnName: "organization_id" },
  { tableName: "conversation_assignments", columnName: "organization_id" },
  { tableName: "contact_owners", columnName: "organization_id" },
  { tableName: "inbox_thread_summary", columnName: "organization_id" },
  { tableName: "contact_summary", columnName: "organization_id" },
  { key: "messages", tableName: "messages", columnName: "organization_id" },
  { tableName: "media_assets", columnName: "organization_id" },
  { key: "sales", tableName: "sales_orders", columnName: "organization_id" },
  { tableName: "leads", columnName: "organization_id" },
  { key: "repairProposals", tableName: "contact_repair_proposals", columnName: "organization_id" },
  { tableName: "quick_reply_templates", columnName: "organization_id" },
  { tableName: "processed_event_keys", columnName: "organization_id" },
  { tableName: "contact_identities", columnName: "organization_id" },
  { key: "conversations", tableName: "conversations", columnName: "organization_id" },
  { key: "contacts", tableName: "contacts", columnName: "organization_id" },
  { tableName: "dashboard_metrics_daily", columnName: "organization_id" },
  { tableName: "usage_daily", columnName: "organization_id" },
  { tableName: "raw_channel_events", columnName: "organization_id" },
  { tableName: "raw_whatsapp_events", columnName: "organization_id" },
  { tableName: "whatsapp_sync_jobs", columnName: "organization_id" },
  { tableName: "whatsapp_connection_events", columnName: "organization_id" },
  { tableName: "whatsapp_account_sessions", columnName: "whatsapp_account_id" },
  { key: "whatsappAccounts", tableName: "whatsapp_accounts", columnName: "organization_id" },
  { tableName: "organization_user_permissions", columnName: "organization_user_id" },
  { key: "users", tableName: "organization_users", columnName: "organization_id", excludeSuperAdminUsers: true }
];

export class OrganizationNotFoundError extends Error {
  constructor() {
    super("Organization not found");
  }
}

export class ConfirmationTextMismatchError extends Error {
  constructor() {
    super("Confirmation text mismatch");
  }
}

export class ClearOrganizationDataService {
  async getPreview(organizationId: string): Promise<ClearOrganizationDataPreview> {
    const client = await pool.connect();
    try {
      const organization = await this.getOrganization(client, organizationId);
      const counts = await this.getCounts(client, organizationId);

      return {
        organizationId: organization.id,
        organizationName: organization.name,
        counts,
        salesSummary: await this.getSalesSummary(client, organizationId)
      };
    } finally {
      client.release();
    }
  }

  async clearOrganizationData(input: {
    organizationId: string;
    confirmationText: string;
    actorAuthUserId?: string | null;
  }) {
    return withTransaction(async (client) => {
      const organization = await this.getOrganization(client, input.organizationId);
      const expectedConfirmationText = `CLEAR ${organization.name}`;

      if (input.confirmationText !== expectedConfirmationText) {
        throw new ConfirmationTextMismatchError();
      }

      const beforeCounts = await this.getCounts(client, input.organizationId);
      await this.writeAuditLogIfAvailable(client, {
        organizationId: input.organizationId,
        actorAuthUserId: input.actorAuthUserId ?? null,
        action: "organization_data_clear_requested",
        metadata: { beforeCounts }
      });

      const clearedCounts = await this.clearTables(client, input.organizationId);

      await this.writeAuditLogIfAvailable(client, {
        organizationId: input.organizationId,
        actorAuthUserId: input.actorAuthUserId ?? null,
        action: "organization_data_clear_completed",
        metadata: { beforeCounts, clearedCounts }
      });

      return {
        success: true as const,
        organizationId: organization.id,
        organizationName: organization.name,
        clearedCounts
      };
    });
  }

  private async getOrganization(client: PoolClient, organizationId: string) {
    const result = await client.query<OrganizationRecord>(
      "select id, name from organizations where id = $1 limit 1",
      [organizationId]
    );

    const organization = result.rows[0];
    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    return organization;
  }

  private async getCounts(client: PoolClient, organizationId: string): Promise<ClearOrganizationDataCounts> {
    const counts = { ...EMPTY_COUNTS };

    for (const table of COUNT_TABLES) {
      if (!(await this.tableColumnExists(client, table.tableName, table.columnName))) {
        continue;
      }

      const result = await client.query<CountRow>(
        `select count(*)::text as count from ${table.tableName} where ${table.columnName} = $1`,
        [organizationId]
      );
      counts[table.key] = Number(result.rows[0]?.count ?? 0);
    }

    return counts;
  }

  private async getSalesSummary(client: PoolClient, organizationId: string) {
    if (!(await this.tableColumnExists(client, "sales_orders", "organization_id"))) {
      return {
        totalOrders: 0,
        openOrders: 0,
        wonOrders: 0,
        lostOrders: 0,
        pipelineValue: 0,
        wonValue: 0,
        averageOrderValue: 0
      };
    }

    const result = await client.query<SalesSummaryRow>(
      `
        select
          count(*)::text as total_orders,
          count(*) filter (where status = 'open')::text as open_orders,
          count(*) filter (where status = 'closed_won')::text as won_orders,
          count(*) filter (where status = 'closed_lost')::text as lost_orders,
          coalesce(sum(case when status = 'open' then total_amount else 0 end), 0)::text as pipeline_value,
          coalesce(sum(case when status = 'closed_won' then total_amount else 0 end), 0)::text as won_value,
          coalesce(avg(nullif(total_amount, 0)), 0)::text as average_order_value
        from sales_orders
        where organization_id = $1
      `,
      [organizationId]
    );

    const row = result.rows[0];

    return {
      totalOrders: Number(row?.total_orders ?? 0),
      openOrders: Number(row?.open_orders ?? 0),
      wonOrders: Number(row?.won_orders ?? 0),
      lostOrders: Number(row?.lost_orders ?? 0),
      pipelineValue: Number(row?.pipeline_value ?? 0),
      wonValue: Number(row?.won_value ?? 0),
      averageOrderValue: Number(row?.average_order_value ?? 0)
    };
  }

  private async clearTables(client: PoolClient, organizationId: string): Promise<ClearOrganizationDataCounts> {
    const clearedCounts = { ...EMPTY_COUNTS };

    for (const table of CLEAR_TABLES) {
      if (!(await this.tableColumnExists(client, table.tableName, table.columnName))) {
        continue;
      }

      const deleteSql = this.buildDeleteSql(table);
      const result = await client.query(deleteSql, [organizationId]);
      const deletedCount = result.rowCount ?? 0;

      if (table.key) {
        clearedCounts[table.key] += deletedCount;
      }
    }

    return clearedCounts;
  }

  private buildDeleteSql(table: { tableName: string; columnName: string; excludeSuperAdminUsers?: boolean }) {
    if (table.tableName === "message_status_events") {
      return `
        delete from message_status_events
        where message_id in (
          select id from messages where organization_id = $1
        )
      `;
    }

    if (table.tableName === "sales_order_items") {
      return `
        delete from sales_order_items
        where sales_order_id in (
          select id from sales_orders where organization_id = $1
        )
      `;
    }

    if (table.tableName === "whatsapp_account_sessions") {
      return `
        delete from whatsapp_account_sessions
        where whatsapp_account_id in (
          select id from whatsapp_accounts where organization_id = $1
        )
      `;
    }

    if (table.tableName === "organization_user_permissions") {
      return `
        delete from organization_user_permissions
        where organization_user_id in (
          select id from organization_users where organization_id = $1 and role <> 'super_admin'
        )
      `;
    }

    if (table.excludeSuperAdminUsers) {
      return `delete from ${table.tableName} where ${table.columnName} = $1 and role <> 'super_admin'`;
    }

    return `delete from ${table.tableName} where ${table.columnName} = $1`;
  }

  private async tableColumnExists(client: PoolClient, tableName: string, columnName: string) {
    const result = await client.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = $1
            and column_name = $2
        ) as exists
      `,
      [tableName, columnName]
    );

    return result.rows[0]?.exists ?? false;
  }

  private async writeAuditLogIfAvailable(
    client: PoolClient,
    input: {
      organizationId: string;
      actorAuthUserId: string | null;
      action: string;
      metadata: unknown;
    }
  ) {
    if (!(await this.tableColumnExists(client, "audit_logs", "action"))) {
      return;
    }

    await client.query(
      `
        insert into audit_logs (
          organization_id,
          actor_auth_user_id,
          actor_role,
          action,
          entity_type,
          entity_id,
          metadata
        ) values ($1, $2, 'super_admin', $3, 'organization', $1, $4::jsonb)
      `,
      [input.organizationId, input.actorAuthUserId, input.action, JSON.stringify(input.metadata)]
    );
  }
}
