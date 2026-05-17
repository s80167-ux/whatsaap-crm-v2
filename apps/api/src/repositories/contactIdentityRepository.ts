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
          profile_name,
          profile_push_name,
          profile_avatar_url,
          identity_quality,
          identity_score
        from contact_identities
        where organization_id = $1
          and whatsapp_account_id = $2
          and wa_jid = $3
          and deleted_at is null
        limit 1
      `,
      [organizationId, whatsappAccountId, whatsappJid]
    );

    return result.rows[0] ?? null;
  }

  async findByNormalizedPhone(
    client: PoolClient,
    organizationId: string,
    whatsappAccountId: string,
    normalizedPhone: string
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
          profile_name,
          profile_push_name,
          profile_avatar_url,
          identity_quality,
          identity_score
        from contact_identities
        where organization_id = $1
          and whatsapp_account_id = $2
          and phone_normalized = $3
          and deleted_at is null
        limit 1
      `,
      [organizationId, whatsappAccountId, normalizedPhone]
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
      profilePushName?: string | null;
      profileAvatarUrl?: string | null;
      identityQuality?: string | null;
      identityScore?: number | null;
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
          profile_push_name,
          profile_avatar_url,
          identity_quality,
          identity_score,
          last_seen_at
        )
        values ($1, 'whatsapp', $2, $3, $4, $5, $6, nullif(trim($7), ''), nullif(trim($8), ''), nullif(trim($9), ''), coalesce($10, 'normal'), coalesce($11, 0), timezone('utc', now()))
        on conflict (organization_id, whatsapp_account_id, wa_jid)
        where deleted_at is null
        do update set
          contact_id = excluded.contact_id,
          whatsapp_account_id = excluded.whatsapp_account_id,
          phone_e164 = case
            when excluded.phone_normalized is null then contact_identities.phone_e164
            when contact_identities.phone_normalized is null then excluded.phone_e164
            when excluded.phone_normalized like '+60%' and contact_identities.phone_normalized not like '+60%' then excluded.phone_e164
            else contact_identities.phone_e164
          end,
          phone_normalized = case
            when excluded.phone_normalized is null then contact_identities.phone_normalized
            when contact_identities.phone_normalized is null then excluded.phone_normalized
            when excluded.phone_normalized like '+60%' and contact_identities.phone_normalized not like '+60%' then excluded.phone_normalized
            else contact_identities.phone_normalized
          end,
          profile_name = case
            when excluded.profile_name is null then contact_identities.profile_name
            when nullif(trim(contact_identities.profile_name), '') is null then excluded.profile_name
            when lower(trim(contact_identities.profile_name)) in ('unknown', 'customer', 'no name', 'whatsapp', 'business', 'user', 'device', 'iphone', 'android', 'test', 'admin', 'contact') then excluded.profile_name
            else contact_identities.profile_name
          end,
          profile_push_name = case
            when excluded.profile_push_name is null then contact_identities.profile_push_name
            when nullif(trim(contact_identities.profile_push_name), '') is null then excluded.profile_push_name
            when lower(trim(contact_identities.profile_push_name)) in ('unknown', 'customer', 'no name', 'whatsapp', 'business', 'user', 'device', 'iphone', 'android', 'test', 'admin', 'contact') then excluded.profile_push_name
            else contact_identities.profile_push_name
          end,
          profile_avatar_url = coalesce(excluded.profile_avatar_url, nullif(trim(contact_identities.profile_avatar_url), '')),
          identity_quality = case
            when coalesce(excluded.identity_score, 0) >= coalesce(contact_identities.identity_score, 0) then excluded.identity_quality
            else contact_identities.identity_quality
          end,
          identity_score = greatest(coalesce(contact_identities.identity_score, 0), coalesce(excluded.identity_score, 0)),
          last_seen_at = timezone('utc', now())
        returning
          id,
          organization_id,
          contact_id,
          whatsapp_account_id,
          wa_jid,
          phone_e164,
          phone_normalized,
          profile_name,
          profile_push_name,
          profile_avatar_url,
          identity_quality,
          identity_score
      `,
      [
        input.organizationId,
        input.contactId,
        input.whatsappAccountId,
        input.whatsappJid,
        input.phoneE164,
        input.phoneNormalized,
        input.profileName,
        input.profilePushName ?? null,
        input.profileAvatarUrl ?? null,
        input.identityQuality ?? null,
        input.identityScore ?? null
      ]
    );

    return result.rows[0];
  }
}
