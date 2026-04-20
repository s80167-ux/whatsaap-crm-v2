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
        select id, organization_id, display_name, phone_primary, phone_primary_normalized
        from contacts
        where organization_id = $1
          and phone_primary_normalized = $2
          and deleted_at is null
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
      phonePrimary: string | null;
      phonePrimaryNormalized: string | null;
    }
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRecord>(
      `
        insert into contacts (
          organization_id,
          display_name,
          phone_primary,
          phone_primary_normalized
        )
        values ($1, nullif(trim($2), ''), $3, $4)
        returning id, organization_id, display_name, phone_primary, phone_primary_normalized
      `,
      [input.organizationId, input.displayName, input.phonePrimary, input.phonePrimaryNormalized]
    );

    return result.rows[0];
  }

  async anchor(
    client: PoolClient,
    input: {
      contactId: string;
      displayName: string | null;
      phonePrimary: string | null;
      phonePrimaryNormalized: string | null;
    }
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRecord>(
      `
        update contacts
        set display_name = coalesce(nullif(trim(display_name), ''), nullif(trim($2), '')),
            phone_primary = coalesce(phone_primary, $3),
            phone_primary_normalized = coalesce(phone_primary_normalized, $4)
        where id = $1
        returning id, organization_id, display_name, phone_primary, phone_primary_normalized
      `,
      [input.contactId, input.displayName, input.phonePrimary, input.phonePrimaryNormalized]
    );

    return result.rows[0];
  }

  async list(client: PoolClient, organizationId: string): Promise<ContactRecord[]> {
    const result = await client.query<ContactRecord>(
      `
        select id, organization_id, display_name, phone_primary, phone_primary_normalized
        from contacts
        where organization_id = $1 and deleted_at is null
        order by updated_at desc, created_at desc
      `,
      [organizationId]
    );

    return result.rows;
  }
}
