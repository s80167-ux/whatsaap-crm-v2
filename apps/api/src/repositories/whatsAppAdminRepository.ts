import type { PoolClient } from "pg";
import type { WhatsAppAccountRecord } from "../types/domain.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { randomUUID } from "node:crypto";

type WhatsAppAccountColumns = {
  id: boolean;
  organization_id: boolean;
  name: boolean;
  label: boolean;
  display_name: boolean;
  phone_number: boolean;
  phone_number_normalized: boolean;
  account_phone_e164: boolean;
  account_phone_normalized: boolean;
  status: boolean;
  connection_status: boolean;
  baileys_session_key: boolean;
  auth_path: boolean;
  account_jid: boolean;
  created_by: boolean;
  created_at: boolean;
  deleted_at: boolean;
  last_connected_at: boolean;
  last_disconnected_at: boolean;
  health_score: boolean;
  history_sync_lookback_days: boolean;
};

export type WhatsAppAccountQrRecord = {
  qr: string;
  generated_at: string;
};

export class WhatsAppAdminRepository {
  private static cachedColumns: WhatsAppAccountColumns | null = null;

  private async getColumns(client: PoolClient): Promise<WhatsAppAccountColumns> {
    if (WhatsAppAdminRepository.cachedColumns) {
      return WhatsAppAdminRepository.cachedColumns;
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
      id: names.has("id"),
      organization_id: names.has("organization_id"),
      name: names.has("name"),
      label: names.has("label"),
      display_name: names.has("display_name"),
      phone_number: names.has("phone_number"),
      phone_number_normalized: names.has("phone_number_normalized"),
      account_phone_e164: names.has("account_phone_e164"),
      account_phone_normalized: names.has("account_phone_normalized"),
      status: names.has("status"),
      connection_status: names.has("connection_status"),
      baileys_session_key: names.has("baileys_session_key"),
      auth_path: names.has("auth_path"),
      account_jid: names.has("account_jid"),
      created_by: names.has("created_by"),
      created_at: names.has("created_at"),
      deleted_at: names.has("deleted_at"),
      last_connected_at: names.has("last_connected_at"),
      last_disconnected_at: names.has("last_disconnected_at"),
      health_score: names.has("health_score"),
      history_sync_lookback_days: names.has("history_sync_lookback_days")
    };

    WhatsAppAdminRepository.cachedColumns = columns;
    return columns;
  }

  private buildSelect(columns: WhatsAppAccountColumns) {
    return `
      select
        id,
        organization_id,
        ${columns.created_by ? "created_by" : "null"} as created_by,
        ${columns.label ? "label" : columns.name ? "name" : "null"} as label,
        ${columns.account_phone_e164 ? "account_phone_e164" : columns.phone_number ? "phone_number" : "null"} as account_phone_e164,
        ${columns.account_phone_normalized ? "account_phone_normalized" : columns.phone_number_normalized ? "phone_number_normalized" : "null"} as account_phone_normalized,
        ${columns.connection_status ? "connection_status" : columns.status ? "status" : "'disconnected'"} as connection_status,
        ${columns.account_jid ? "account_jid" : "null"} as account_jid,
        ${columns.display_name ? "display_name" : columns.label ? "label" : columns.name ? "name" : "null"} as display_name,
        ${columns.last_connected_at ? "last_connected_at" : "null"} as last_connected_at,
        ${columns.last_disconnected_at ? "last_disconnected_at" : "null"} as last_disconnected_at,
        ${columns.health_score ? "health_score" : "null"} as health_score,
        ${columns.history_sync_lookback_days ? "history_sync_lookback_days" : "7"} as history_sync_lookback_days
      from whatsapp_accounts
    `;
  }

  async listAll(client: PoolClient): Promise<WhatsAppAccountRecord[]> {
    const columns = await this.getColumns(client);
    const result = await client.query<WhatsAppAccountRecord>(
      `
        ${this.buildSelect(columns)}
        ${columns.deleted_at ? "where deleted_at is null" : ""}
        order by ${columns.created_at ? "created_at" : "id"} desc
      `
    );

    return result.rows;
  }

  async listByOrganization(client: PoolClient, organizationId: string): Promise<WhatsAppAccountRecord[]> {
    const columns = await this.getColumns(client);
    const result = await client.query<WhatsAppAccountRecord>(
      `
        ${this.buildSelect(columns)}
        where organization_id = $1
          ${columns.deleted_at ? "and deleted_at is null" : ""}
        order by ${columns.created_at ? "created_at" : "id"} desc
      `,
      [organizationId]
    );

    return result.rows;
  }

  async listByOrganizationAndCreator(
    client: PoolClient,
    organizationId: string,
    createdBy: string
  ): Promise<WhatsAppAccountRecord[]> {
    const columns = await this.getColumns(client);

    if (!columns.created_by) {
      return [];
    }

    const result = await client.query<WhatsAppAccountRecord>(
      `
        ${this.buildSelect(columns)}
        where organization_id = $1
          and created_by = $2
          ${columns.deleted_at ? "and deleted_at is null" : ""}
        order by ${columns.created_at ? "created_at" : "id"} desc
      `,
      [organizationId, createdBy]
    );

    return result.rows;
  }

  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      name: string;
      phoneNumber: string | null;
      createdBy: string | null;
      historySyncLookbackDays?: number | null;
    }
  ): Promise<WhatsAppAccountRecord> {
    const columns = await this.getColumns(client);
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
    const accountId = randomUUID();
    const insertColumns = ["id", "organization_id"];
    const insertValues = ["$1", "$2"];
    const params: Array<string | number | null> = [accountId, input.organizationId];

    const pushValue = (column: string, value: string | number | null) => {
      insertColumns.push(column);
      params.push(value);
      insertValues.push(`$${params.length}`);
    };

    if (columns.name) {
      pushValue("name", input.name);
    }

    if (columns.label) {
      pushValue("label", input.name);
    }

    if (columns.display_name) {
      pushValue("display_name", input.name);
    }

    if (columns.phone_number) {
      pushValue("phone_number", input.phoneNumber);
    }

    if (columns.phone_number_normalized) {
      pushValue("phone_number_normalized", normalizedPhone);
    }

    if (columns.account_phone_e164) {
      pushValue("account_phone_e164", input.phoneNumber);
    }

    if (columns.account_phone_normalized) {
      pushValue("account_phone_normalized", normalizedPhone);
    }

    if (columns.status) {
      pushValue("status", "disconnected");
    }

    if (columns.connection_status) {
      pushValue("connection_status", "disconnected");
    }

    if (columns.baileys_session_key) {
      pushValue("baileys_session_key", accountId);
    }

    if (columns.auth_path) {
      pushValue("auth_path", accountId);
    }

    if (columns.created_by) {
      pushValue("created_by", input.createdBy);
    }

    if (columns.history_sync_lookback_days) {
      pushValue("history_sync_lookback_days", input.historySyncLookbackDays ?? 7);
    }

    const result = await client.query<WhatsAppAccountRecord>(
      `
        insert into whatsapp_accounts (
          ${insertColumns.join(",\n          ")}
        )
        values (${insertValues.join(", ")})
        returning
          id,
          organization_id,
          ${columns.created_by ? "created_by" : "null"} as created_by,
          ${columns.label ? "label" : columns.name ? "name" : "null"} as label,
          ${columns.account_phone_e164 ? "account_phone_e164" : columns.phone_number ? "phone_number" : "null"} as account_phone_e164,
          ${columns.account_phone_normalized ? "account_phone_normalized" : columns.phone_number_normalized ? "phone_number_normalized" : "null"} as account_phone_normalized,
          ${columns.connection_status ? "connection_status" : columns.status ? "status" : "'disconnected'"} as connection_status,
          ${columns.account_jid ? "account_jid" : "null"} as account_jid,
          ${columns.display_name ? "display_name" : columns.label ? "label" : columns.name ? "name" : "null"} as display_name,
          ${columns.last_connected_at ? "last_connected_at" : "null"} as last_connected_at,
          ${columns.last_disconnected_at ? "last_disconnected_at" : "null"} as last_disconnected_at,
          ${columns.health_score ? "health_score" : "null"} as health_score,
          ${columns.history_sync_lookback_days ? "history_sync_lookback_days" : "7"} as history_sync_lookback_days
      `,
      params
    );

    return result.rows[0];
  }

  async findById(client: PoolClient, accountId: string): Promise<WhatsAppAccountRecord | null> {
    const columns = await this.getColumns(client);
    const result = await client.query<WhatsAppAccountRecord>(
      `
        ${this.buildSelect(columns)}
        where id = $1
          ${columns.deleted_at ? "and deleted_at is null" : ""}
        limit 1
      `,
      [accountId]
    );

    return result.rows[0] ?? null;
  }

  async update(
    client: PoolClient,
    accountId: string,
    input: {
      organizationId: string;
      name: string;
      phoneNumber: string | null;
      historySyncLookbackDays?: number | null;
    }
  ): Promise<WhatsAppAccountRecord | null> {
    const columns = await this.getColumns(client);
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
    const assignments = ["organization_id = $2"];
    const params: Array<string | number | null> = [accountId, input.organizationId];

    const pushAssignment = (column: string, value: string | number | null) => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (columns.name) {
      pushAssignment("name", input.name);
    }

    if (columns.label) {
      pushAssignment("label", input.name);
    }

    if (columns.display_name) {
      pushAssignment("display_name", input.name);
    }

    if (columns.phone_number) {
      pushAssignment("phone_number", input.phoneNumber);
    }

    if (columns.phone_number_normalized) {
      pushAssignment("phone_number_normalized", normalizedPhone);
    }

    if (columns.account_phone_e164) {
      pushAssignment("account_phone_e164", input.phoneNumber);
    }

    if (columns.account_phone_normalized) {
      pushAssignment("account_phone_normalized", normalizedPhone);
    }

    if (columns.history_sync_lookback_days) {
      pushAssignment("history_sync_lookback_days", input.historySyncLookbackDays ?? 7);
    }

    const result = await client.query<WhatsAppAccountRecord>(
      `
        update whatsapp_accounts
        set ${assignments.join(",\n            ")}
        where id = $1
          ${columns.deleted_at ? "and deleted_at is null" : ""}
        returning
          id,
          organization_id,
          ${columns.created_by ? "created_by" : "null"} as created_by,
          ${columns.label ? "label" : columns.name ? "name" : "null"} as label,
          ${columns.account_phone_e164 ? "account_phone_e164" : columns.phone_number ? "phone_number" : "null"} as account_phone_e164,
          ${columns.account_phone_normalized ? "account_phone_normalized" : columns.phone_number_normalized ? "phone_number_normalized" : "null"} as account_phone_normalized,
          ${columns.connection_status ? "connection_status" : columns.status ? "status" : "'disconnected'"} as connection_status,
          ${columns.account_jid ? "account_jid" : "null"} as account_jid,
          ${columns.display_name ? "display_name" : columns.label ? "label" : columns.name ? "name" : "null"} as display_name,
          ${columns.last_connected_at ? "last_connected_at" : "null"} as last_connected_at,
          ${columns.last_disconnected_at ? "last_disconnected_at" : "null"} as last_disconnected_at,
          ${columns.health_score ? "health_score" : "null"} as health_score,
          ${columns.history_sync_lookback_days ? "history_sync_lookback_days" : "7"} as history_sync_lookback_days
      `,
      params
    );

    return result.rows[0] ?? null;
  }

  async deleteById(client: PoolClient, accountId: string): Promise<WhatsAppAccountRecord | null> {
    const columns = await this.getColumns(client);
    const result = await client.query<WhatsAppAccountRecord>(
      `
        delete from whatsapp_accounts
        where id = $1
        returning
          id,
          organization_id,
          ${columns.created_by ? "created_by" : "null"} as created_by,
          ${columns.label ? "label" : columns.name ? "name" : "null"} as label,
          ${columns.account_phone_e164 ? "account_phone_e164" : columns.phone_number ? "phone_number" : "null"} as account_phone_e164,
          ${columns.account_phone_normalized ? "account_phone_normalized" : columns.phone_number_normalized ? "phone_number_normalized" : "null"} as account_phone_normalized,
          ${columns.connection_status ? "connection_status" : columns.status ? "status" : "'disconnected'"} as connection_status,
          ${columns.account_jid ? "account_jid" : "null"} as account_jid,
          ${columns.display_name ? "display_name" : columns.label ? "label" : columns.name ? "name" : "null"} as display_name,
          ${columns.last_connected_at ? "last_connected_at" : "null"} as last_connected_at,
          ${columns.last_disconnected_at ? "last_disconnected_at" : "null"} as last_disconnected_at,
          ${columns.health_score ? "health_score" : "null"} as health_score,
          ${columns.history_sync_lookback_days ? "history_sync_lookback_days" : "7"} as history_sync_lookback_days
      `,
      [accountId]
    );

    return result.rows[0] ?? null;
  }

  async findLatestQrByAccountId(client: PoolClient, accountId: string): Promise<WhatsAppAccountQrRecord | null> {
    const result = await client.query<WhatsAppAccountQrRecord>(
      `
        select
          payload->>'qr' as qr,
          created_at::text as generated_at
        from whatsapp_connection_events
        where whatsapp_account_id = $1
          and event_type = 'qr_required'
          and coalesce(payload->>'qr', '') <> ''
        order by created_at desc, id desc
        limit 1
      `,
      [accountId]
    );

    return result.rows[0] ?? null;
  }
}
