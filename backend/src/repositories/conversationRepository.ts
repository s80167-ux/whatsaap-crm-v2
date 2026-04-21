import type { PoolClient } from "pg";
import type { ConversationRecord } from "../types/domain.js";

export class ConversationRepository {
  async findOrCreate(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      contactId: string;
    }
  ): Promise<ConversationRecord> {
    const existing = await client.query<ConversationRecord>(
      `
        select
          id,
          organization_id,
          whatsapp_account_id,
          contact_id,
          channel,
          external_thread_key,
          last_message_at,
          last_incoming_at,
          last_outgoing_at,
          unread_count
        from conversations
        where organization_id = $1
          and whatsapp_account_id = $2
          and contact_id = $3
          and channel = 'whatsapp'
        order by created_at asc
        limit 1
      `,
      [input.organizationId, input.whatsappAccountId, input.contactId]
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const result = await client.query<ConversationRecord>(
      `
        insert into conversations (
          organization_id,
          channel,
          whatsapp_account_id,
          contact_id,
          external_thread_key,
          thread_type,
          status
        )
        values ($1, 'whatsapp', $2, $3, $4, 'direct', 'open')
        on conflict (organization_id, channel, whatsapp_account_id, external_thread_key)
        do update set updated_at = timezone('utc', now())
        returning
          id,
          organization_id,
          whatsapp_account_id,
          contact_id,
          channel,
          external_thread_key,
          last_message_at,
          last_incoming_at,
          last_outgoing_at,
          unread_count
      `,
      [input.organizationId, input.whatsappAccountId, input.contactId, `contact:${input.contactId}`]
    );

    return result.rows[0];
  }

  async bumpLastMessage(
    client: PoolClient,
    input: {
      conversationId: string;
      direction: "incoming" | "outgoing";
      sentAt: Date;
      incrementUnread: boolean;
    }
  ): Promise<void> {
    await client.query(
      `
        update conversations
        set last_message_at = greatest(coalesce(last_message_at, to_timestamp(0)), $2),
            last_incoming_at = case
                                 when $3 = 'incoming'
                                   then greatest(coalesce(last_incoming_at, to_timestamp(0)), $2)
                                 else last_incoming_at
                               end,
            last_outgoing_at = case
                                 when $3 = 'outgoing'
                                   then greatest(coalesce(last_outgoing_at, to_timestamp(0)), $2)
                                 else last_outgoing_at
                               end,
            unread_count = case when $4 then unread_count + 1 else unread_count end
        where id = $1
      `,
      [input.conversationId, input.sentAt.toISOString(), input.direction, input.incrementUnread]
    );
  }

  async list(client: PoolClient, organizationId: string): Promise<any[]> {
    const result = await client.query(
      `
        select
          c.id,
          c.organization_id,
          c.whatsapp_account_id,
          c.contact_id,
          c.channel,
          c.external_thread_key,
          coalesce(lm.sent_at, c.last_message_at) as last_message_at,
          c.last_incoming_at,
          c.last_outgoing_at,
          c.unread_count,
          coalesce(
            nullif(trim(ct.display_name), ''),
            nullif(trim(ci.profile_push_name), ''),
            nullif(trim(ci.profile_name), ''),
            nullif(trim(ct.primary_phone_e164), ''),
            nullif(trim(ci.phone_e164), ''),
            'Unknown'
          ) as contact_name,
          coalesce(
            nullif(trim(ct.primary_phone_normalized), ''),
            nullif(trim(ci.phone_normalized), '')
          ) as phone_number_normalized,
          coalesce(
            nullif(trim(ct.primary_avatar_url), ''),
            nullif(trim(ci.profile_avatar_url), '')
          ) as contact_avatar_url,
          lm.content_text as last_message_preview,
          lm.message_type as last_message_type,
          lm.direction as last_message_direction
        from conversations c
        join contacts ct on ct.id = c.contact_id
        left join lateral (
          select
            ci.profile_name,
            ci.profile_push_name,
            ci.phone_e164,
            ci.phone_normalized,
            ci.profile_avatar_url
          from contact_identities ci
          where ci.contact_id = c.contact_id
            and (ci.whatsapp_account_id = c.whatsapp_account_id or ci.whatsapp_account_id is null)
          order by
            case when ci.whatsapp_account_id = c.whatsapp_account_id then 0 else 1 end,
            case when nullif(trim(ci.profile_push_name), '') is not null then 0 else 1 end,
            case when nullif(trim(ci.profile_name), '') is not null then 0 else 1 end,
            case when nullif(trim(ci.phone_normalized), '') is not null then 0 else 1 end,
            ci.last_seen_at desc nulls last,
            ci.updated_at desc nulls last,
            ci.created_at desc,
            ci.id desc
          limit 1
        ) ci on true
        left join lateral (
          select sent_at, content_text, message_type, direction
          from messages
          where conversation_id = c.id
          order by sent_at desc nulls last, created_at desc, id desc
          limit 1
        ) lm on true
        where c.organization_id = $1
        order by
          coalesce(lm.sent_at, c.last_message_at) desc nulls last,
          c.updated_at desc,
          c.id desc
      `,
      [organizationId]
    );

    return result.rows;
  }
}
