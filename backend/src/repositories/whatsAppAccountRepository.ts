import type { PoolClient } from "pg";
import type { WhatsAppAccountRecord } from "../types/domain.js";

export class WhatsAppAccountRepository {
  async listActive(client: PoolClient): Promise<WhatsAppAccountRecord[]> {
    const result = await client.query<WhatsAppAccountRecord>(
      `
        select
          id,
          organization_id,
          label,
          account_phone_e164,
          account_phone_normalized,
          connection_status,
          account_jid,
          display_name
        from whatsapp_accounts
        where connection_status in ('new', 'qr_required', 'pairing', 'connected', 'reconnecting', 'disconnected', 'error')
        order by created_at asc
      `
    );

    return result.rows;
  }

  async findById(client: PoolClient, accountId: string): Promise<WhatsAppAccountRecord | null> {
    const result = await client.query<WhatsAppAccountRecord>(
      `
        select
          id,
          organization_id,
          label,
          account_phone_e164,
          account_phone_normalized,
          connection_status,
          account_jid,
          display_name
        from whatsapp_accounts
        where id = $1
        limit 1
      `,
      [accountId]
    );

    return result.rows[0] ?? null;
  }

  async updateStatus(client: PoolClient, accountId: string, status: string): Promise<void> {
    await client.query(
      `
        update whatsapp_accounts
        set connection_status = $2,
            last_connected_at = case when $2 = 'connected' then timezone('utc', now()) else last_connected_at end,
            last_disconnected_at = case when $2 = 'disconnected' then timezone('utc', now()) else last_disconnected_at end
        where id = $1
      `,
      [accountId, status]
    );
  }
}
