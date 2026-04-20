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
        select
          id,
          organization_id,
          contact_id,
          whatsapp_account_id,
          wa_jid,
          phone_e164,
          phone_normalized,
          profile_name
        from contact_identities
        where organization_id = $1
          and whatsapp_account_id = $2
          and wa_jid = $3
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
      phoneE164: string | null;
      phoneNormalized: string | null;
      profileName: string | null;
    }
  ): Promise<ContactIdentityRecord> {
    const result = await client.query<ContactIdentityRecord>(
      `
        insert into contact_identities (
          organization_id,
          channel,
          contact_id,
          whatsapp_account_id,
          wa_jid,
          phone_e164,
          phone_normalized,
          profile_name,
          last_seen_at
        )
        values ($1, 'whatsapp', $2, $3, $4, $5, $6, nullif(trim($7), ''), timezone('utc', now()))
        on conflict (organization_id, channel, wa_jid)
        do update set
          contact_id = excluded.contact_id,
          whatsapp_account_id = excluded.whatsapp_account_id,
          phone_e164 = coalesce(contact_identities.phone_e164, excluded.phone_e164),
          phone_normalized = coalesce(contact_identities.phone_normalized, excluded.phone_normalized),
          profile_name = coalesce(nullif(trim(contact_identities.profile_name), ''), excluded.profile_name),
          last_seen_at = timezone('utc', now())
        returning
          id,
          organization_id,
          contact_id,
          whatsapp_account_id,
          wa_jid,
          phone_e164,
          phone_normalized,
          profile_name
      `,
      [
        input.organizationId,
        input.contactId,
        input.whatsappAccountId,
        input.whatsappJid,
        input.phoneE164,
        input.phoneNormalized,
        input.profileName
      ]
    );

    return result.rows[0];
  }
}
