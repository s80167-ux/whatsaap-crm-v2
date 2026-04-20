import type { PoolClient } from "pg";
import type { WhatsAppAccountRecord } from "../types/domain.js";
import { normalizePhoneNumber } from "../utils/phone.js";

export class WhatsAppAdminRepository {
  async listAll(client: PoolClient): Promise<WhatsAppAccountRecord[]> {
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
        order by created_at desc
      `
    );

    return result.rows;
  }

  async listByOrganization(client: PoolClient, organizationId: string): Promise<WhatsAppAccountRecord[]> {
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
        where organization_id = $1
        order by created_at desc
      `,
      [organizationId]
    );

    return result.rows;
  }

  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      name: string;
      phoneNumber: string | null;
    }
  ): Promise<WhatsAppAccountRecord> {
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);

    const result = await client.query<WhatsAppAccountRecord>(
      `
        insert into whatsapp_accounts (
          organization_id,
          label,
          display_name,
          account_phone_e164,
          account_phone_normalized,
          connection_status
        )
        values ($1, $2, $2, $3, $4, 'disconnected')
        returning
          id,
          organization_id,
          label,
          account_phone_e164,
          account_phone_normalized,
          connection_status,
          account_jid,
          display_name
      `,
      [
        input.organizationId,
        input.name,
        input.phoneNumber,
        normalizedPhone
      ]
    );

    return result.rows[0];
  }
}
