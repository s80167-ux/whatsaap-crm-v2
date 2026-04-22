import type { PoolClient } from "pg";
import type { ContactRecord } from "../types/domain.js";
import { ProjectionRepository } from "./projectionRepository.js";

export class ContactRepository {
  private readonly projectionRepository = new ProjectionRepository();

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
          primary_phone_normalized,
          owner_user_id
        from contacts
        where organization_id = $1
          and primary_phone_normalized = $2
        limit 1
      `,
      [organizationId, normalizedPhone]
    );

    return result.rows[0] ?? null;
  }

  async findById(
    client: PoolClient,
    organizationId: string,
    contactId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<ContactRecord | null> {
    const assignedOnly = options?.assignedOnly ?? false;
    const organizationUserId = options?.organizationUserId ?? null;

    const result = await client.query<ContactRecord>(
      `
        select
          c.id,
          c.organization_id,
          c.display_name,
          c.primary_phone_e164,
          c.primary_phone_normalized,
          c.primary_avatar_url,
          c.owner_user_id
        from contacts c
        where c.organization_id = $1
          and c.id = $2
          and (
            not $3::boolean
            or c.owner_user_id = $4
            or exists (
              select 1
              from contact_owners co
              where co.contact_id = c.id
                and co.organization_user_id = $4
            )
          )
        limit 1
      `,
      [organizationId, contactId, assignedOnly, organizationUserId]
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
          primary_phone_normalized,
          owner_user_id
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
          primary_phone_normalized,
          owner_user_id
      `,
      [input.contactId, input.displayName, input.primaryPhoneE164, input.primaryPhoneNormalized]
    );

    return result.rows[0];
  }

  async updateProfile(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      displayName?: string | null;
      primaryPhoneE164?: string | null;
      primaryPhoneNormalized?: string | null;
    }
  ): Promise<ContactRecord | null> {
    const result = await client.query<ContactRecord>(
      `
        update contacts
        set display_name = case
              when $3::text is null then display_name
              when nullif(trim($3), '') is null then display_name
              else nullif(trim($3), '')
            end,
            primary_phone_e164 = case
              when $4::text is null then primary_phone_e164
              when nullif(trim($4), '') is null then null
              else $4
            end,
            primary_phone_normalized = case
              when $4::text is null then primary_phone_normalized
              when nullif(trim($4), '') is null then null
              else $5
            end,
            updated_at = timezone('utc', now())
        where id = $1
          and organization_id = $2
        returning
          id,
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized,
          primary_avatar_url,
          owner_user_id
      `,
      [
        input.contactId,
        input.organizationId,
        input.displayName ?? null,
        input.primaryPhoneE164 ?? null,
        input.primaryPhoneNormalized ?? null
      ]
    );

    return result.rows[0] ?? null;
  }

  async list(
    client: PoolClient,
    organizationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
      activityRange?: {
        since: string;
      };
    }
  ): Promise<ContactRecord[]> {
    return this.projectionRepository.listContactSummaries(client, organizationId, options);
  }

  async assign(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      organizationUserId: string;
    }
  ): Promise<ContactRecord | null> {
    await client.query(
      `
        delete from contact_owners
        where contact_id = $1
          and owner_type = 'primary'
      `,
      [input.contactId]
    );

    const contactResult = await client.query<ContactRecord>(
      `
        update contacts
        set owner_user_id = $3,
            updated_at = timezone('utc', now())
        where id = $1
          and organization_id = $2
        returning
          id,
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized,
          owner_user_id
      `,
      [input.contactId, input.organizationId, input.organizationUserId]
    );

    const contact = contactResult.rows[0] ?? null;

    if (!contact) {
      return null;
    }

    await client.query(
      `
        insert into contact_owners (
          organization_id,
          contact_id,
          organization_user_id,
          owner_type
        )
        values ($1, $2, $3, 'primary')
        on conflict (contact_id, organization_user_id)
        do update set owner_type = excluded.owner_type
      `,
      [input.organizationId, input.contactId, input.organizationUserId]
    );

    return contact;
  }
}
