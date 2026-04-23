import type { PoolClient } from "pg";
import type { WhatsAppAccountRecord } from "../types/domain.js";

type WhatsAppAccountColumns = {
  name: boolean;
  label: boolean;
  display_name: boolean;
  phone_number: boolean;
  phone_number_normalized: boolean;
  account_phone_e164: boolean;
  account_phone_normalized: boolean;
  status: boolean;
  connection_status: boolean;
  account_jid: boolean;
  created_at: boolean;
  last_connected_at: boolean;
  last_disconnected_at: boolean;
  health_score: boolean;
  history_sync_lookback_days: boolean;
};

export class WhatsAppAccountRepository {
  private static cachedColumns: WhatsAppAccountColumns | null = null;

  private async getColumns(client: PoolClient): Promise<WhatsAppAccountColumns> {
    if (WhatsAppAccountRepository.cachedColumns) {
      return WhatsAppAccountRepository.cachedColumns;
    }

    const result = await client.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'whatsapp_accounts'
      `
    );

    const names = new Set(result.rows.map((row) => row.column_name));
    const columns: WhatsAppAccountColumns = {
      name: names.has("name"),
      label: names.has("label"),
      display_name: names.has("display_name"),
      phone_number: names.has("phone_number"),
      phone_number_normalized: names.has("phone_number_normalized"),
      account_phone_e164: names.has("account_phone_e164"),
      account_phone_normalized: names.has("account_phone_normalized"),
      status: names.has("status"),
      connection_status: names.has("connection_status"),
      account_jid: names.has("account_jid"),
      created_at: names.has("created_at"),
      last_connected_at: names.has("last_connected_at"),
      last_disconnected_at: names.has("last_disconnected_at"),
      health_score: names.has("health_score"),
      history_sync_lookback_days: names.has("history_sync_lookback_days")
    };

    WhatsAppAccountRepository.cachedColumns = columns;
    return columns;
  }

  private buildSelect(columns: WhatsAppAccountColumns) {
    return `
      select
        id,
        organization_id,
        ${columns.label ? "label" : columns.name ? "name" : "null"} as label,
        ${columns.account_phone_e164 ? "account_phone_e164" : columns.phone_number ? "phone_number" : "null"} as account_phone_e164,
        ${columns.account_phone_normalized ? "account_phone_normalized" : columns.phone_number_normalized ? "phone_number_normalized" : "null"} as account_phone_normalized,
        ${columns.connection_status ? "connection_status" : columns.status ? "status" : "'disconnected'"} as connection_status,
        ${columns.account_jid ? "account_jid" : "null"} as account_jid,
        ${columns.display_name ? "display_name" : columns.label ? "label" : columns.name ? "name" : "null"} as display_name,
        ${columns.history_sync_lookback_days ? "history_sync_lookback_days" : "7"} as history_sync_lookback_days
      from whatsapp_accounts
    `;
  }

  async listActive(client: PoolClient): Promise<WhatsAppAccountRecord[]> {
    const columns = await this.getColumns(client);
    const result = await client.query<WhatsAppAccountRecord>(
      `
        ${this.buildSelect(columns)}
        where ${columns.connection_status ? "connection_status" : "status"} in ('new', 'qr_required', 'pairing', 'connected', 'reconnecting', 'disconnected', 'error')
        order by ${columns.created_at ? "created_at" : "id"} asc
      `
    );

    return result.rows;
  }

  async findById(client: PoolClient, accountId: string): Promise<WhatsAppAccountRecord | null> {
    const columns = await this.getColumns(client);
    const result = await client.query<WhatsAppAccountRecord>(
      `
        ${this.buildSelect(columns)}
        where id = $1
        limit 1
      `,
      [accountId]
    );

    return result.rows[0] ?? null;
  }

  async updateStatus(client: PoolClient, accountId: string, status: string): Promise<void> {
    const columns = await this.getColumns(client);
    const assignments = [];
    const params: string[] = [accountId, status];

    if (columns.connection_status) {
      assignments.push("connection_status = $2");
    }

    if (columns.status) {
      assignments.push("status = $2");
    }

    if (columns.last_connected_at) {
      assignments.push("last_connected_at = case when $2 = 'connected' then timezone('utc', now()) else last_connected_at end");
    }

    if (columns.last_disconnected_at) {
      assignments.push("last_disconnected_at = case when $2 = 'disconnected' then timezone('utc', now()) else last_disconnected_at end");
    }

    if (assignments.length === 0) {
      return;
    }

    await client.query(
      `
        update whatsapp_accounts
        set ${assignments.join(",\n            ")}
        where id = $1
      `,
      params
    );

    // Logging for debug
    // eslint-disable-next-line no-console
    console.log(`[updateStatus] accountId=${accountId}, status=${status}, time=${new Date().toISOString()}`);
  }

  /**
   * Calculate and update health score for an account.
   * 100 if connected, 0 if disconnected, 50 otherwise.
   */
  async updateHealthScore(client: PoolClient, accountId: string, status: string): Promise<void> {
    const columns = await this.getColumns(client);
    if (!columns.health_score) return;
    let score = 50;
    if (status === "connected") score = 100;
    else if (status === "disconnected") score = 0;
    await client.query(
      `update whatsapp_accounts set health_score = $2 where id = $1`,
      [accountId, score]
    );
    // eslint-disable-next-line no-console
    console.log(`[updateHealthScore] accountId=${accountId}, status=${status}, score=${score}`);
  }
}
