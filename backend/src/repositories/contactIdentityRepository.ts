import type { PoolClient } from "pg";
import type { ContactIdentityRecord } from "../types/domain.js";

export class ContactIdentityRepository {
  async findByJid(
    client: PoolClient,
    organizationId: string,
    whatsappAccountId: string,
    whatsappJid: string
  ): Promise<ContactIdentityRecord | null> {
    const result = await client.query<ContactIdentityRecord>(
      `
        select id, organization_id, contact_id, whatsapp_account_id, whatsapp_jid,
               phone_number, phone_number_normalized, raw_profile_name
        from contact_identities
        where organization_id = $1
          and whatsapp_account_id = $2
          and whatsapp_jid = $3
          and deleted_at is null
        limit 1
      `,
      [organizationId, whatsappAccountId, whatsappJid]
    );

    return result.rows[0] ?? null;
  }

  async upsert(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      whatsappAccountId: string;
      whatsappJid: string;
      phoneNumber: string | null;
      phoneNumberNormalized: string | null;
      profileName: string | null;
    }
  ): Promise<ContactIdentityRecord> {
    const result = await client.query<ContactIdentityRecord>(
      `
        insert into contact_identities (
          organization_id,
          contact_id,
          whatsapp_account_id,
          whatsapp_jid,
          phone_number,
          phone_number_normalized,
          raw_profile_name,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $6, nullif(trim($7), ''), timezone('utc', now()))
        on conflict (organization_id, whatsapp_account_id, whatsapp_jid)
        where deleted_at is null
        do update set
          contact_id = excluded.contact_id,
          phone_number = coalesce(contact_identities.phone_number, excluded.phone_number),
          phone_number_normalized = coalesce(contact_identities.phone_number_normalized, excluded.phone_number_normalized),
          raw_profile_name = coalesce(nullif(trim(contact_identities.raw_profile_name), ''), excluded.raw_profile_name),
          last_seen_at = timezone('utc', now())
        returning id, organization_id, contact_id, whatsapp_account_id, whatsapp_jid,
                  phone_number, phone_number_normalized, raw_profile_name
      `,
      [
        input.organizationId,
        input.contactId,
        input.whatsappAccountId,
        input.whatsappJid,
        input.phoneNumber,
        input.phoneNumberNormalized,
        input.profileName
      ]
    );

    return result.rows[0];
  }
}
