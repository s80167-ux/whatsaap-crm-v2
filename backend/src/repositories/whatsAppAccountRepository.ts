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
  last_connection_error_code: boolean;
  last_connection_error_message: boolean;
  reconnect_failure_count: boolean;
  ban_suspected_at: boolean;
  reconnect_suppressed_at: boolean;
};

type UpdateStatusOptions = {
  errorCode?: string | null;
  errorMessage?: string | null;
  reconnectFailureCount?: number | null;
  banSuspectedAt?: Date | string | null;
  reconnectSuppressedAt?: Date | string | null;
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
      last_connection_error_code: names.has("last_connection_error_code"),
      last_connection_error_message: names.has("last_connection_error_message"),
      reconnect_failure_count: names.has("reconnect_failure_count"),
      ban_suspected_at: names.has("ban_suspected_at"),
      reconnect_suppressed_at: names.has("reconnect_suppressed_at")
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
        ${columns.reconnect_failure_count ? "reconnect_failure_count" : "0"} as reconnect_failure_count,
        ${columns.last_connection_error_code ? "last_connection_error_code" : "null"} as last_connection_error_code,
        ${columns.last_connection_error_message ? "last_connection_error_message" : "null"} as last_connection_error_message,
        ${columns.ban_suspected_at ? "ban_suspected_at" : "null"} as ban_suspected_at,
        ${columns.reconnect_suppressed_at ? "reconnect_suppressed_at" : "null"} as reconnect_suppressed_at
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

  async updateStatus(client: PoolClient, accountId: string, status: string, options: UpdateStatusOptions = {}): Promise<void> {
    const columns = await this.getColumns(client);
    const assignments = [];
    const params: Array<string | number | null> = [accountId, status];
    const pushParam = (value: string | number | null) => {
      params.push(value);
      return `$${params.length}`;
    };

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
      assignments.push(
        "last_disconnected_at = case when $2 in ('disconnected', 'logged_out', 'suspected_ban', 'reconnect_suppressed') then timezone('utc', now()) else last_disconnected_at end"
      );
    }

    if (columns.last_connection_error_code) {
      assignments.push(`last_connection_error_code = ${pushParam(options.errorCode ?? null)}`);
    }

    if (columns.last_connection_error_message) {
      assignments.push(`last_connection_error_message = ${pushParam(options.errorMessage ?? null)}`);
    }

    if (columns.reconnect_failure_count) {
      assignments.push(`reconnect_failure_count = ${pushParam(options.reconnectFailureCount ?? null)}`);
    }

    if (columns.ban_suspected_at) {
      assignments.push(
        `ban_suspected_at = ${pushParam(options.banSuspectedAt ? new Date(options.banSuspectedAt).toISOString() : null)}`
      );
    }

    if (columns.reconnect_suppressed_at) {
      assignments.push(
        `reconnect_suppressed_at = ${pushParam(options.reconnectSuppressedAt ? new Date(options.reconnectSuppressedAt).toISOString() : null)}`
      );
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
  }
}
