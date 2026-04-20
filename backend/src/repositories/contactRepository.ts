import type { PoolClient } from "pg";
import type { ContactRecord } from "../types/domain.js";

export class ContactRepository {
  async findByNormalizedPhone(
    client: PoolClient,
    organizationId: string,
    normalizedPhone: string
  ): Promise<ContactRecord | null> {
    const result = await client.query<ContactRecord>(
      `
        select
          id,
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized
        from contacts
        where organization_id = $1
          and primary_phone_normalized = $2
        limit 1
      `,
      [organizationId, normalizedPhone]
    );

    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      displayName: string | null;
      primaryPhoneE164: string | null;
      primaryPhoneNormalized: string | null;
    }
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRecord>(
      `
        insert into contacts (
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized
        )
        values ($1, nullif(trim($2), ''), $3, $4)
        returning
          id,
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized
      `,
      [input.organizationId, input.displayName, input.primaryPhoneE164, input.primaryPhoneNormalized]
    );

    return result.rows[0];
  }

  async anchor(
    client: PoolClient,
    input: {
      contactId: string;
      displayName: string | null;
      primaryPhoneE164: string | null;
      primaryPhoneNormalized: string | null;
    }
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRecord>(
      `
        update contacts
        set display_name = coalesce(nullif(trim(display_name), ''), nullif(trim($2), '')),
            primary_phone_e164 = coalesce(primary_phone_e164, $3),
            primary_phone_normalized = coalesce(primary_phone_normalized, $4)
        where id = $1
        returning
          id,
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized
      `,
      [input.contactId, input.displayName, input.primaryPhoneE164, input.primaryPhoneNormalized]
    );

    return result.rows[0];
  }

  async list(client: PoolClient, organizationId: string): Promise<ContactRecord[]> {
    const result = await client.query<ContactRecord>(
      `
        select
          id,
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized
        from contacts
        where organization_id = $1
        order by updated_at desc, created_at desc
      `,
      [organizationId]
    );

    return result.rows;
  }
}
