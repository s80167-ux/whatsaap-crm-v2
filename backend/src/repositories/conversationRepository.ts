import type { PoolClient } from "pg";
import type { ConversationRecord } from "../types/domain.js";
import { ProjectionRepository } from "./projectionRepository.js";

export class ConversationRepository {
  private readonly projectionRepository = new ProjectionRepository();

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
        on conflict (organization_id, whatsapp_account_id, contact_id)
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

  async assign(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      organizationUserId: string;
    }
  ): Promise<{ id: string; assigned_user_id: string | null } | null> {
    await client.query(
      `
        delete from conversation_assignments
        where conversation_id = $1
          and assignment_type = 'primary'
      `,
      [input.conversationId]
    );

    const conversationResult = await client.query<{ id: string; assigned_user_id: string | null }>(
      `
        update conversations
        set assigned_user_id = $3,
            updated_at = timezone('utc', now())
        where id = $1
          and organization_id = $2
        returning id, assigned_user_id
      `,
      [input.conversationId, input.organizationId, input.organizationUserId]
    );

    const conversation = conversationResult.rows[0] ?? null;

    if (!conversation) {
      return null;
    }

    await client.query(
      `
        insert into conversation_assignments (
          organization_id,
          conversation_id,
          organization_user_id,
          assignment_type
        )
        values ($1, $2, $3, 'primary')
        on conflict (conversation_id, organization_user_id)
        do update set assignment_type = excluded.assignment_type
      `,
      [input.organizationId, input.conversationId, input.organizationUserId]
    );

    return conversation;
  }

  async list(
    client: PoolClient,
    organizationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<any[]> {
    return this.projectionRepository.listConversationSummaries(client, organizationId, options);
  }
}
