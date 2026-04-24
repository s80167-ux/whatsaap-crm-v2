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
    organizationId: string | null,
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
          case
            when c.is_anchor_locked and nullif(trim(c.display_name), '') is not null then c.display_name
            else coalesce(
              latest_identity.profile_name,
              case
                when nullif(trim(c.display_name), '') is null then null
                when c.anchored_by_source = 'manual' then c.display_name
                when lower(trim(c.display_name)) = any(blocked_names.blocked_names) then null
                else c.display_name
              end,
              c.primary_phone_e164,
              c.primary_phone_normalized
            )
          end as display_name,
          c.primary_phone_e164,
          coalesce(c.primary_phone_normalized, latest_identity.phone_normalized, latest_identity.phone_e164) as primary_phone_normalized,
          coalesce(c.primary_avatar_url, latest_identity.profile_avatar_url) as primary_avatar_url,
          c.owner_user_id,
          coalesce(src.source_count, 0)::integer as whatsapp_source_count,
          coalesce(src.sources, '[]'::json) as whatsapp_sources
        from contacts c
        left join lateral (
          with related_accounts as (
            select ci.whatsapp_account_id
            from contact_identities ci
            where ci.contact_id = c.id
              and ci.whatsapp_account_id is not null
            union
            select conv.whatsapp_account_id
            from conversations conv
            where conv.contact_id = c.id
              and conv.whatsapp_account_id is not null
            union
            select m.whatsapp_account_id
            from messages m
            where m.contact_id = c.id
              and m.whatsapp_account_id is not null
          )
          select coalesce(array_agg(distinct lower(trim(candidate_name))), '{}'::text[]) as blocked_names
          from related_accounts ra
          join whatsapp_accounts wa on wa.id = ra.whatsapp_account_id
          cross join lateral unnest(array[nullif(trim(wa.label), ''), nullif(trim(wa.display_name), '')]) as candidate_name
        ) blocked_names on true
        left join lateral (
          select
            case
              when nullif(trim(ci.profile_name), '') is null then null
              when lower(trim(ci.profile_name)) = any(blocked_names.blocked_names) then null
              else nullif(trim(ci.profile_name), '')
            end as profile_name,
            nullif(trim(ci.profile_avatar_url), '') as profile_avatar_url,
            ci.phone_e164,
            ci.phone_normalized
          from contact_identities ci
          where ci.contact_id = c.id
            and coalesce(ci.is_active, true)
          order by ci.last_seen_at desc nulls last, ci.updated_at desc, ci.created_at desc, ci.id desc
          limit 1
        ) latest_identity on true
        left join lateral (
          with source_accounts as (
            select
              wa.id,
              coalesce(wa.label, wa.display_name, wa.account_phone_normalized, wa.account_phone_e164, wa.id::text) as label,
              max(seen_at) as last_seen_at
            from (
              select ci.whatsapp_account_id, ci.last_seen_at as seen_at
              from contact_identities ci
              where ci.contact_id = c.id
                and ci.whatsapp_account_id is not null
              union all
              select conv.whatsapp_account_id, greatest(conv.last_message_at, conv.last_incoming_at, conv.last_outgoing_at) as seen_at
              from conversations conv
              where conv.contact_id = c.id
              union all
              select m.whatsapp_account_id, m.sent_at as seen_at
              from messages m
              where m.contact_id = c.id
            ) source_events
            join whatsapp_accounts wa on wa.id = source_events.whatsapp_account_id
            group by wa.id, label
          )
          select
            count(*)::integer as source_count,
            json_agg(
              json_build_object('id', id, 'label', label)
              order by last_seen_at desc nulls last, label asc
            ) as sources
          from source_accounts
        ) src on true
        where ($1::uuid is null or c.organization_id = $1)
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
      primaryAvatarUrl?: string | null;
    }
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRecord>(
      `
        insert into contacts (
          organization_id,
          display_name,
          primary_phone_e164,
          primary_phone_normalized,
          primary_avatar_url
        )
        values ($1, nullif(trim($2), ''), $3, $4, $5)
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
        input.organizationId,
        input.displayName,
        input.primaryPhoneE164,
        input.primaryPhoneNormalized,
        input.primaryAvatarUrl ?? null
      ]
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
      primaryAvatarUrl?: string | null;
    }
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRecord>(
      `
        update contacts
        set display_name = case
              when is_anchor_locked then display_name
              when nullif(trim($2), '') is null then display_name
              when nullif(trim(display_name), '') is null then nullif(trim($2), '')
              when length(trim($2)) > length(trim(display_name)) then nullif(trim($2), '')
              else display_name
            end,
            primary_phone_e164 = case
              when nullif(trim($3), '') is null then primary_phone_e164
              when primary_phone_normalized is null then $3
              when $4 like '+60%' and primary_phone_normalized not like '+60%' then $3
              else primary_phone_e164
            end,
            primary_phone_normalized = case
              when $4::text is null then primary_phone_normalized
              when primary_phone_normalized is null then $4
              when $4 like '+60%' and primary_phone_normalized not like '+60%' then $4
              else primary_phone_normalized
            end,
            primary_avatar_url = coalesce(nullif(trim($5), ''), primary_avatar_url),
            anchored_at = case
              when is_anchor_locked or nullif(trim($2), '') is null then anchored_at
              when nullif(trim(display_name), '') is null then timezone('utc', now())
              when length(trim($2)) > length(trim(display_name)) then timezone('utc', now())
              else anchored_at
            end,
            anchored_by_source = case
              when is_anchor_locked or nullif(trim($2), '') is null then anchored_by_source
              when nullif(trim(display_name), '') is null then 'whatsapp_identity'
              when length(trim($2)) > length(trim(display_name)) then 'whatsapp_identity'
              else anchored_by_source
            end
        where id = $1
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
        input.displayName,
        input.primaryPhoneE164,
        input.primaryPhoneNormalized,
        input.primaryAvatarUrl ?? null
      ]
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
            is_anchor_locked = case
              when $3::text is null or nullif(trim($3), '') is null then is_anchor_locked
              else true
            end,
            anchored_at = case
              when $3::text is null or nullif(trim($3), '') is null then anchored_at
              else timezone('utc', now())
            end,
            anchored_by_source = case
              when $3::text is null or nullif(trim($3), '') is null then anchored_by_source
              else 'manual'
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
    organizationId: string | null,
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
