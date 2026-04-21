import type { PoolClient } from "pg";
import type { ContactRecord } from "../types/domain.js";

export interface ConversationSummaryRow {
  id: string;
  organization_id: string;
  whatsapp_account_id: string | null;
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
          ct.display_name,
          ct.primary_phone_normalized,
          ct.primary_avatar_url,
          c.assigned_user_id,
          coalesce(m.content_text, m.message_type),
          m.message_type,
          m.direction,
          c.last_message_at,
          c.unread_count,
          c.status,
          timezone('utc', now())
        from conversations c
        join contacts ct on ct.id = c.contact_id
        left join lateral (
          select content_text, message_type, direction
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
          ct.display_name,
          ct.primary_phone_normalized,
          ct.primary_avatar_url,
          coalesce(conv.total_conversations, 0),
          coalesce(msg.total_messages, 0),
          conv.last_incoming_at,
          conv.last_outgoing_at,
          nullif(
            greatest(
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
          select
            count(*)::integer as total_conversations,
            max(last_incoming_at) as last_incoming_at,
            max(last_outgoing_at) as last_outgoing_at
          from conversations
          where contact_id = ct.id
        ) conv on true
        left join lateral (
          select count(*)::integer as total_messages
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
    organizationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<ConversationSummaryRow[]> {
    const assignedOnly = options?.assignedOnly ?? false;
    const organizationUserId = options?.organizationUserId ?? null;

    const result = await client.query<ConversationSummaryRow>(
      `
        select
          its.conversation_id as id,
          its.organization_id,
          its.whatsapp_account_id,
          its.contact_id,
          its.assigned_user_id,
          'whatsapp'::text as channel,
          c.external_thread_key,
          its.last_message_at,
          c.last_incoming_at,
          c.last_outgoing_at,
          its.unread_count,
          coalesce(its.contact_display_name, ct.display_name, ct.primary_phone_e164, ct.primary_phone_normalized, 'Unknown') as contact_name,
          its.contact_primary_phone as phone_number_normalized,
          its.contact_avatar_url as contact_avatar_url,
          its.last_message_preview,
          its.last_message_type,
          its.last_message_direction
        from inbox_thread_summary its
        join conversations c on c.id = its.conversation_id
        join contacts ct on ct.id = its.contact_id
        where its.organization_id = $1
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
        order by its.last_message_at desc nulls last, its.updated_at desc, its.conversation_id desc
      `,
      [organizationId, assignedOnly, organizationUserId]
    );

    return result.rows;
  }

  async listContactSummaries(
    client: PoolClient,
    organizationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<ContactRecord[]> {
    const assignedOnly = options?.assignedOnly ?? false;
    const organizationUserId = options?.organizationUserId ?? null;

    const result = await client.query<ContactRecord>(
      `
        select
          cs.contact_id as id,
          cs.organization_id,
          cs.display_name,
          cs.primary_phone as primary_phone_e164,
          cs.primary_phone as primary_phone_normalized,
          cs.owner_user_id
        from contact_summary cs
        where cs.organization_id = $1
          and (
            not $2::boolean
            or cs.owner_user_id = $3
            or exists (
              select 1
              from contact_owners co
              where co.contact_id = cs.contact_id
                and co.organization_user_id = $3
            )
          )
        order by cs.last_activity_at desc nulls last, cs.updated_at desc, cs.contact_id desc
      `,
      [organizationId, assignedOnly, organizationUserId]
    );

    return result.rows;
  }
}
