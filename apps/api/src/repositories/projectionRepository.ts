import type { PoolClient } from "pg";
import type { ContactRecord } from "../types/domain.js";

export interface ConversationSummaryRow {
  id: string;
  organization_id: string;
  whatsapp_account_id: string | null;
  whatsapp_account_label: string | null;
  contact_id: string;
  assigned_user_id: string | null;
  channel: string;
  external_thread_key: string | null;
  last_message_at: string | null;
  last_incoming_at: string | null;
  last_outgoing_at: string | null;
  unread_count: number;
  contact_name: string;
  phone_number_normalized: string | null;
  contact_avatar_url: string | null;
  last_message_preview: string | null;
  last_message_type: string | null;
  last_message_direction: string | null;
  has_sales: boolean;
  has_sales_lead_tag?: boolean;
}

export class ProjectionRepository {
  async refreshConversationSummary(client: PoolClient, conversationId: string): Promise<void> {
    await client.query(
      `
        insert into inbox_thread_summary (
          conversation_id,
          organization_id,
          whatsapp_account_id,
          contact_id,
          contact_display_name,
          contact_primary_phone,
          contact_avatar_url,
          assigned_user_id,
          last_message_preview,
          last_message_type,
          last_message_direction,
          last_message_at,
          unread_count,
          thread_status,
          updated_at
        )
        select
          c.id,
          c.organization_id,
          c.whatsapp_account_id,
          c.contact_id,
          case
            when ct.is_anchor_locked and nullif(trim(ct.display_name), '') is not null then ct.display_name
            else coalesce(
              latest_identity.profile_name,
              case
                when nullif(trim(ct.display_name), '') is null then null
                when ct.anchored_by_source = 'manual' then ct.display_name
                when lower(trim(ct.display_name)) = any(blocked_names.blocked_names) then null
                else ct.display_name
              end,
              ct.primary_phone_e164,
              ct.primary_phone_normalized
            )
          end,
          coalesce(ct.primary_phone_normalized, latest_identity.phone_normalized, latest_identity.phone_e164, ct.primary_phone_e164),
          coalesce(ct.primary_avatar_url, latest_identity.profile_avatar_url),
          c.assigned_user_id,
          coalesce(m.content_text, m.message_type),
          m.message_type,
          m.direction,
          coalesce(m.sent_at, c.last_message_at, c.last_incoming_at, c.last_outgoing_at),
          c.unread_count,
          c.status,
          timezone('utc', now())
        from conversations c
        join contacts ct on ct.id = c.contact_id
        left join lateral (
          select coalesce(
            array_remove(
              array[
                lower(nullif(trim(wa.label), '')),
                lower(nullif(trim(wa.display_name), ''))
              ],
              null
            ),
            '{}'::text[]
          ) as blocked_names
          from whatsapp_accounts wa
          where wa.id = c.whatsapp_account_id
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
          where ci.contact_id = c.contact_id
            and coalesce(ci.is_active, true)
          order by ci.last_seen_at desc nulls last, ci.updated_at desc, ci.created_at desc, ci.id desc
          limit 1
        ) latest_identity on true
        left join lateral (
          select sent_at, content_text, message_type, direction
          from messages
          where conversation_id = c.id
          order by sent_at desc nulls last, created_at desc, id desc
          limit 1
        ) m on true
        where c.id = $1
        on conflict (conversation_id)
        do update set
          organization_id = excluded.organization_id,
          whatsapp_account_id = excluded.whatsapp_account_id,
          contact_id = excluded.contact_id,
          contact_display_name = excluded.contact_display_name,
          contact_primary_phone = excluded.contact_primary_phone,
          contact_avatar_url = excluded.contact_avatar_url,
          assigned_user_id = excluded.assigned_user_id,
          last_message_preview = excluded.last_message_preview,
          last_message_type = excluded.last_message_type,
          last_message_direction = excluded.last_message_direction,
          last_message_at = excluded.last_message_at,
          unread_count = excluded.unread_count,
          thread_status = excluded.thread_status,
          updated_at = excluded.updated_at
      `,
      [conversationId]
    );
  }

  async refreshContactSummary(client: PoolClient, contactId: string): Promise<void> {
    await client.query(
      `
        insert into contact_summary (
          contact_id,
          organization_id,
          display_name,
          primary_phone,
          avatar_url,
          total_conversations,
          total_messages,
          last_incoming_at,
          last_outgoing_at,
          last_activity_at,
          lead_status,
          owner_user_id,
          updated_at
        )
        select
          ct.id,
          ct.organization_id,
          case
            when ct.is_anchor_locked and nullif(trim(ct.display_name), '') is not null then ct.display_name
            else coalesce(
              latest_identity.profile_name,
              case
                when nullif(trim(ct.display_name), '') is null then null
                when ct.anchored_by_source = 'manual' then ct.display_name
                when lower(trim(ct.display_name)) = any(blocked_names.blocked_names) then null
                else ct.display_name
              end,
              ct.primary_phone_e164,
              ct.primary_phone_normalized
            )
          end,
          coalesce(ct.primary_phone_normalized, latest_identity.phone_normalized, latest_identity.phone_e164, ct.primary_phone_e164),
          coalesce(ct.primary_avatar_url, latest_identity.profile_avatar_url),
          coalesce(conv.total_conversations, 0),
          coalesce(msg.total_messages, 0),
          coalesce(msg.last_incoming_at, conv.last_incoming_at),
          coalesce(msg.last_outgoing_at, conv.last_outgoing_at),
          nullif(
            greatest(
              coalesce(msg.last_message_at, to_timestamp(0)),
              coalesce(conv.last_incoming_at, to_timestamp(0)),
              coalesce(conv.last_outgoing_at, to_timestamp(0)),
              coalesce(ct.last_activity_at, to_timestamp(0))
            ),
            to_timestamp(0)
          ),
          ld.status,
          ct.owner_user_id,
          timezone('utc', now())
        from contacts ct
        left join lateral (
          with related_accounts as (
            select ci.whatsapp_account_id
            from contact_identities ci
            where ci.contact_id = ct.id
              and ci.whatsapp_account_id is not null
            union
            select c.whatsapp_account_id
            from conversations c
            where c.contact_id = ct.id
              and c.whatsapp_account_id is not null
            union
            select m.whatsapp_account_id
            from messages m
            where m.contact_id = ct.id
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
          where ci.contact_id = ct.id
            and coalesce(ci.is_active, true)
          order by ci.last_seen_at desc nulls last, ci.updated_at desc, ci.created_at desc, ci.id desc
          limit 1
        ) latest_identity on true
        left join lateral (
          select
            count(*)::integer as total_conversations,
            max(last_incoming_at) as last_incoming_at,
            max(last_outgoing_at) as last_outgoing_at
          from conversations
          where contact_id = ct.id
        ) conv on true
        left join lateral (
          select
            count(*)::integer as total_messages,
            max(sent_at) as last_message_at,
            max(sent_at) filter (where direction = 'incoming') as last_incoming_at,
            max(sent_at) filter (where direction = 'outgoing') as last_outgoing_at
          from messages
          where contact_id = ct.id
        ) msg on true
        left join lateral (
          select status
          from leads
          where contact_id = ct.id
          order by updated_at desc nulls last, created_at desc, id desc
          limit 1
        ) ld on true
        where ct.id = $1
        on conflict (contact_id)
        do update set
          organization_id = excluded.organization_id,
          display_name = excluded.display_name,
          primary_phone = excluded.primary_phone,
          avatar_url = excluded.avatar_url,
          total_conversations = excluded.total_conversations,
          total_messages = excluded.total_messages,
          last_incoming_at = excluded.last_incoming_at,
          last_outgoing_at = excluded.last_outgoing_at,
          last_activity_at = excluded.last_activity_at,
          lead_status = excluded.lead_status,
          owner_user_id = excluded.owner_user_id,
          updated_at = excluded.updated_at
      `,
      [contactId]
    );
  }

  async refreshDashboardMetrics(client: PoolClient, organizationId: string, metricDate: Date): Promise<void> {
    await client.query(
      `
        insert into dashboard_metrics_daily (
          organization_id,
          metric_date,
          total_contacts,
          active_contacts,
          open_conversations,
          messages_incoming,
          messages_outgoing,
          new_leads,
          won_sales
        )
        select
          $1,
          $2::date,
          (select count(*)::integer from contacts where organization_id = $1),
          (select count(*)::integer from contacts where organization_id = $1 and last_activity_at >= $2::date),
          (select count(*)::integer from conversations where organization_id = $1 and status = 'open'),
          (
            select count(*)::integer
            from messages
            where organization_id = $1
              and direction = 'incoming'
              and sent_at >= $2::date
              and sent_at < ($2::date + interval '1 day')
          ),
          (
            select count(*)::integer
            from messages
            where organization_id = $1
              and direction = 'outgoing'
              and sent_at >= $2::date
              and sent_at < ($2::date + interval '1 day')
          ),
          (
            select count(*)::integer
            from leads
            where organization_id = $1
              and created_at >= $2::date
              and created_at < ($2::date + interval '1 day')
          ),
          (
            select coalesce(sum(total_amount), 0)
            from sales_orders
            where organization_id = $1
              and status = 'closed_won'
              and closed_at >= $2::date
              and closed_at < ($2::date + interval '1 day')
          )
        on conflict (organization_id, metric_date)
        do update set
          total_contacts = excluded.total_contacts,
          active_contacts = excluded.active_contacts,
          open_conversations = excluded.open_conversations,
          messages_incoming = excluded.messages_incoming,
          messages_outgoing = excluded.messages_outgoing,
          new_leads = excluded.new_leads,
          won_sales = excluded.won_sales
      `,
      [organizationId, metricDate.toISOString()]
    );
  }

  async listConversationSummaries(
    client: PoolClient,
    organizationId: string | null,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
      activityRange?: {
        since: string;
      };
    }
  ): Promise<ConversationSummaryRow[]> {
    const assignedOnly = options?.assignedOnly ?? false;
    const organizationUserId = options?.organizationUserId ?? null;
    const activitySince = options?.activityRange?.since ?? null;

    const result = await client.query<ConversationSummaryRow>(
      `
        select
          its.conversation_id as id,
          its.organization_id,
          its.whatsapp_account_id,
          coalesce(wa.label, wa.display_name, wa.account_phone_normalized, wa.account_phone_e164, wa.id::text) as whatsapp_account_label,
          its.contact_id,
          its.assigned_user_id,
          'whatsapp'::text as channel,
          c.external_thread_key,
          coalesce(latest_message.sent_at, its.last_message_at, c.last_message_at, c.last_incoming_at, c.last_outgoing_at) as last_message_at,
          c.last_incoming_at,
          c.last_outgoing_at,
          its.unread_count,
          case
            when ct.is_anchor_locked and nullif(trim(ct.display_name), '') is not null then ct.display_name
            else coalesce(
              latest_identity.profile_name,
              case
                when nullif(trim(its.contact_display_name), '') is null then null
                when lower(trim(its.contact_display_name)) = any(blocked_names.blocked_names) then null
                else its.contact_display_name
              end,
              case
                when nullif(trim(ct.display_name), '') is null then null
                when ct.anchored_by_source = 'manual' then ct.display_name
                when lower(trim(ct.display_name)) = any(blocked_names.blocked_names) then null
                else ct.display_name
              end,
              ct.primary_phone_e164,
              ct.primary_phone_normalized,
              'Unknown'
            )
          end as contact_name,
          coalesce(ct.primary_phone_normalized, latest_identity.phone_normalized, latest_identity.phone_e164, its.contact_primary_phone) as phone_number_normalized,
          coalesce(ct.primary_avatar_url, latest_identity.profile_avatar_url, its.contact_avatar_url) as contact_avatar_url,
          its.last_message_preview,
          its.last_message_type,
          its.last_message_direction,
          coalesce(sales_info.has_sales, false) as has_sales
        from inbox_thread_summary its
        join conversations c on c.id = its.conversation_id
        join contacts ct on ct.id = its.contact_id
        left join whatsapp_accounts wa on wa.id = its.whatsapp_account_id
        left join lateral (
          select coalesce(
            array_remove(
              array[
                lower(nullif(trim(wa.label), '')),
                lower(nullif(trim(wa.display_name), ''))
              ],
              null
            ),
            '{}'::text[]
          ) as blocked_names
        ) blocked_names on true
        left join lateral (
          select sent_at
          from messages
          where conversation_id = its.conversation_id
          order by sent_at desc nulls last, created_at desc, id desc
          limit 1
        ) latest_message on true
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
          where ci.contact_id = its.contact_id
            and coalesce(ci.is_active, true)
          order by ci.last_seen_at desc nulls last, ci.updated_at desc, ci.created_at desc, ci.id desc
          limit 1
        ) latest_identity on true
        left join lateral (
          select
            exists (
              select 1 from sales_orders so
              where so.contact_id = its.contact_id
                and so.organization_id = its.organization_id
            )
            or exists (
              select 1 from leads l
              where l.contact_id = its.contact_id
                and l.organization_id = its.organization_id
            ) as has_sales
        ) sales_info on true
        where ($1::uuid is null or its.organization_id = $1)
          and (
            $4::timestamptz is null
            or coalesce(latest_message.sent_at, its.last_message_at, c.last_message_at, c.last_incoming_at, c.last_outgoing_at) >= $4::timestamptz
          )
          and (
            not $2::boolean
            or its.assigned_user_id = $3
            or exists (
              select 1
              from conversation_assignments ca
              where ca.conversation_id = its.conversation_id
                and ca.organization_user_id = $3
            )
          )
        order by coalesce(latest_message.sent_at, its.last_message_at, c.last_message_at, c.last_incoming_at, c.last_outgoing_at) desc nulls last,
                 its.updated_at desc,
                 its.conversation_id desc
      `,
      [organizationId, assignedOnly, organizationUserId, activitySince]
    );

    return result.rows.map((row) => ({
      ...row,
      has_sales_lead_tag: false
    }));
  }

  async listContactSummaries(
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
    const assignedOnly = options?.assignedOnly ?? false;
    const organizationUserId = options?.organizationUserId ?? null;
    const activitySince = options?.activityRange?.since ?? null;

    const result = await client.query<ContactRecord>(
      `
        select
          ct.id,
          ct.organization_id,
          case
            when ct.is_anchor_locked and nullif(trim(ct.display_name), '') is not null then ct.display_name
            else coalesce(
              latest_identity.profile_name,
              case
                when nullif(trim(ct.display_name), '') is null then null
                when ct.anchored_by_source = 'manual' then ct.display_name
                when lower(trim(ct.display_name)) = any(blocked_names.blocked_names) then null
                else ct.display_name
              end,
              case
                when nullif(trim(cs.display_name), '') is null then null
                when lower(trim(cs.display_name)) = any(blocked_names.blocked_names) then null
                else cs.display_name
              end,
              ct.primary_phone_e164,
              ct.primary_phone_normalized
            )
          end as display_name,
          ct.primary_phone_e164,
          coalesce(ct.primary_phone_normalized, latest_identity.phone_normalized, latest_identity.phone_e164, cs.primary_phone) as primary_phone_normalized,
          coalesce(ct.primary_avatar_url, latest_identity.profile_avatar_url, cs.avatar_url) as primary_avatar_url,
          ct.owner_user_id,
          coalesce(src.source_count, 0)::integer as whatsapp_source_count,
          coalesce(src.sources, '[]'::json) as whatsapp_sources
        from contacts ct
        left join contact_summary cs on cs.contact_id = ct.id
        left join lateral (
          with related_accounts as (
            select ci.whatsapp_account_id
            from contact_identities ci
            where ci.contact_id = ct.id
              and ci.whatsapp_account_id is not null
            union
            select c.whatsapp_account_id
            from conversations c
            where c.contact_id = ct.id
              and c.whatsapp_account_id is not null
            union
            select m.whatsapp_account_id
            from messages m
            where m.contact_id = ct.id
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
          where ci.contact_id = ct.id
            and coalesce(ci.is_active, true)
          order by ci.last_seen_at desc nulls last, ci.updated_at desc, ci.created_at desc, ci.id desc
          limit 1
        ) latest_identity on true
        left join lateral (
          select
            max(last_incoming_at) as last_incoming_at,
            max(last_outgoing_at) as last_outgoing_at
          from conversations
          where contact_id = ct.id
        ) conv on true
        left join lateral (
          with source_accounts as (
            select
              wa.id,
              coalesce(wa.label, wa.display_name, wa.account_phone_normalized, wa.account_phone_e164, wa.id::text) as label,
              max(seen_at) as last_seen_at
            from (
              select ci.whatsapp_account_id, ci.last_seen_at as seen_at
              from contact_identities ci
              where ci.contact_id = ct.id
                and ci.whatsapp_account_id is not null
              union all
              select c.whatsapp_account_id, greatest(c.last_message_at, c.last_incoming_at, c.last_outgoing_at) as seen_at
              from conversations c
              where c.contact_id = ct.id
              union all
              select m.whatsapp_account_id, m.sent_at as seen_at
              from messages m
              where m.contact_id = ct.id
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
        where ($1::uuid is null or ct.organization_id = $1)
          and (
            $4::timestamptz is null
            or greatest(
              coalesce(cs.last_activity_at, to_timestamp(0)),
              coalesce(conv.last_incoming_at, to_timestamp(0)),
              coalesce(conv.last_outgoing_at, to_timestamp(0)),
              coalesce(ct.last_activity_at, to_timestamp(0)),
              coalesce(ct.updated_at, ct.created_at)
            ) >= $4::timestamptz
          )
          and (
            not $2::boolean
            or ct.owner_user_id = $3
            or exists (
              select 1
              from contact_owners co
              where co.contact_id = ct.id
                and co.organization_user_id = $3
            )
          )
        order by greatest(
          coalesce(cs.last_activity_at, to_timestamp(0)),
          coalesce(conv.last_incoming_at, to_timestamp(0)),
          coalesce(conv.last_outgoing_at, to_timestamp(0)),
          coalesce(ct.last_activity_at, to_timestamp(0)),
          coalesce(ct.updated_at, ct.created_at)
        ) desc,
        coalesce(cs.updated_at, ct.updated_at, ct.created_at) desc,
        ct.id desc
      `,
      [organizationId, assignedOnly, organizationUserId, activitySince]
    );

    return result.rows;
  }
}
