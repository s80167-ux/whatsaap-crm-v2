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
    const result = await client.query<ConversationRecord>(
      `
        insert into conversations (
          organization_id,
          whatsapp_account_id,
          contact_id
        )
        values ($1, $2, $3)
        on conflict (organization_id, whatsapp_account_id, contact_id)
        do update set updated_at = timezone('utc', now())
        returning id, organization_id, whatsapp_account_id, contact_id,
                  last_message_id, last_message_at, last_message_preview, unread_count
      `,
      [input.organizationId, input.whatsappAccountId, input.contactId]
    );

    return result.rows[0];
  }

  async bumpLastMessage(
    client: PoolClient,
    input: {
      conversationId: string;
      messageId: string;
      sentAt: Date;
      preview: string | null;
      incrementUnread: boolean;
    }
  ): Promise<void> {
    await client.query(
      `
        update conversations
        set last_message_id = case
                                when last_message_at is null or last_message_at <= $3 then $2
                                else last_message_id
                              end,
            last_message_at = greatest(coalesce(last_message_at, to_timestamp(0)), $3),
            last_message_preview = case
                                     when last_message_at is null or last_message_at <= $3 then $4
                                     else last_message_preview
                                   end,
            unread_count = case when $5 then unread_count + 1 else unread_count end
        where id = $1
      `,
      [input.conversationId, input.messageId, input.sentAt.toISOString(), input.preview, input.incrementUnread]
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
          c.last_message_at,
          c.last_message_preview,
          c.unread_count,
          coalesce(ct.display_name, ci.raw_profile_name, ct.phone_primary, ci.phone_number, 'Unknown') as contact_name,
          coalesce(ct.phone_primary_normalized, ci.phone_number_normalized) as phone_number_normalized
        from conversations c
        join contacts ct on ct.id = c.contact_id
        left join lateral (
          select raw_profile_name, phone_number, phone_number_normalized
          from contact_identities
          where contact_id = c.contact_id
            and (whatsapp_account_id = c.whatsapp_account_id or whatsapp_account_id is null)
            and deleted_at is null
          order by updated_at desc
          limit 1
        ) ci on true
        where c.organization_id = $1
          and c.deleted_at is null
        order by c.last_message_at desc nulls last, c.updated_at desc, c.id desc
      `,
      [organizationId]
    );

    return result.rows;
  }
}
