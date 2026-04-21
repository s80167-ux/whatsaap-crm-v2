import type { PoolClient } from "pg";
import type { MessageRecord } from "../types/domain.js";

export class MessageRepository {
  async findByExternalMessageId(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      externalMessageId: string;
    }
  ): Promise<MessageRecord | null> {
    const result = await client.query<MessageRecord>(
      `
        select
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          external_message_id,
          external_chat_id,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          delivered_at,
          read_at,
          ack_status
        from messages
        where organization_id = $1
          and whatsapp_account_id = $2
          and external_message_id = $3
        limit 1
      `,
      [input.organizationId, input.whatsappAccountId, input.externalMessageId]
    );

    return result.rows[0] ?? null;
  }

  async createOutboundDraft(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      externalMessageId: string;
      externalChatId?: string | null;
      contentText?: string | null;
      messageType?: string;
      contentJson?: unknown;
      sentAt: Date;
    }
  ): Promise<MessageRecord> {
    const result = await client.query<MessageRecord>(
      `
        insert into messages (
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          external_message_id,
          external_chat_id,
          channel,
          direction,
          message_type,
          content_text,
          content_json,
          ack_status,
          sent_at
        )
        values ($1, $2, $3, $4, $5, $6, 'whatsapp', 'outgoing', $7, nullif($8, ''), $9, 'pending', $10)
        returning
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          external_message_id,
          external_chat_id,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          delivered_at,
          read_at,
          ack_status
      `,
      [
        input.organizationId,
        input.conversationId,
        input.contactId,
        input.whatsappAccountId,
        input.externalMessageId,
        input.externalChatId ?? null,
        input.messageType ?? "text",
        input.contentText ?? null,
        input.contentJson ?? null,
        input.sentAt.toISOString()
      ]
    );

    return result.rows[0];
  }

  async insertIfAbsent(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      externalMessageId: string;
      externalChatId?: string | null;
      direction: "incoming" | "outgoing";
      messageType: string;
      contentText: string | null;
      rawPayload: unknown;
      sentAt: Date;
      ackStatus?: "pending" | "server_ack" | "device_delivered" | "read" | "played" | "failed";
    }
  ): Promise<{ message: MessageRecord; inserted: boolean }> {
    const result = await client.query<MessageRecord & { inserted: boolean }>(
      `
        with inserted as (
          insert into messages (
            organization_id,
            conversation_id,
            contact_id,
            whatsapp_account_id,
            external_message_id,
            external_chat_id,
            channel,
            direction,
            message_type,
            content_text,
            content_json,
            ack_status,
            sent_at
          )
          values ($1, $2, $3, $4, $5, $6, 'whatsapp', $7, $8, nullif($9, ''), $10, $11, $12)
          on conflict (organization_id, whatsapp_account_id, external_message_id)
          do nothing
          returning *, true as inserted
        )
        select * from inserted
        union all
        select m.*, false as inserted
        from messages m
        where m.organization_id = $1
          and m.whatsapp_account_id = $4
          and m.external_message_id = $5
          and not exists (select 1 from inserted)
        limit 1
      `,
      [
        input.organizationId,
        input.conversationId,
        input.contactId,
        input.whatsappAccountId,
        input.externalMessageId,
        input.externalChatId ?? null,
        input.direction,
        input.messageType,
        input.contentText,
        input.rawPayload ?? null,
        input.ackStatus ?? "pending",
        input.sentAt.toISOString()
      ]
    );

    const { inserted, ...message } = result.rows[0];
    return { message, inserted };
  }

  async appendStatusEvent(
    client: PoolClient,
    input: {
      messageId: string;
      status: string;
      payload?: unknown;
    }
  ): Promise<void> {
    await client.query(
      `
        insert into message_status_events (message_id, status, payload)
        values ($1, $2, $3)
      `,
      [input.messageId, input.status, input.payload ?? null]
    );
  }

  async updateAckStatus(
    client: PoolClient,
    input: {
      messageId: string;
      ackStatus: "pending" | "server_ack" | "device_delivered" | "read" | "played" | "failed";
      deliveredAt?: Date | null;
      readAt?: Date | null;
      failedAt?: Date | null;
    }
  ): Promise<void> {
    const deliveredAt = input.deliveredAt ? input.deliveredAt.toISOString() : null;
    const readAt = input.readAt ? input.readAt.toISOString() : null;
    const failedAt = input.failedAt ? input.failedAt.toISOString() : null;

    await client.query(
      `
        update messages
        set ack_status = case
              when (
                case ack_status
                  when 'played' then 5
                  when 'read' then 4
                  when 'device_delivered' then 3
                  when 'server_ack' then 2
                  when 'pending' then 1
                  when 'failed' then 0
                  else 0
                end
              ) <= (
                case $2::text
                  when 'played' then 5
                  when 'read' then 4
                  when 'device_delivered' then 3
                  when 'server_ack' then 2
                  when 'pending' then 1
                  when 'failed' then 0
                  else 0
                end
              )
              or ack_status = 'failed'
            then $2::text
            else ack_status
          end,
            delivered_at = case
              when $3::timestamptz is null then delivered_at
              when delivered_at is null then $3::timestamptz
              else delivered_at
            end,
            read_at = case
              when $4::timestamptz is null then read_at
              when read_at is null then $4::timestamptz
              else read_at
            end,
            failed_at = case
              when $2::text = 'failed' then coalesce($5::timestamptz, failed_at)
              else null
            end,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [
        input.messageId,
        input.ackStatus,
        deliveredAt,
        readAt,
        failedAt
      ]
    );
  }

  async updateOutboundDispatch(
    client: PoolClient,
    input: {
      messageId: string;
      externalMessageId: string;
      externalChatId?: string | null;
      rawPayload?: unknown;
      sentAt: Date;
    }
  ): Promise<void> {
    await client.query(
      `
        update messages
        set external_message_id = $2,
            external_chat_id = coalesce($3, external_chat_id),
            content_json = coalesce($4, content_json),
            sent_at = $5,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [
        input.messageId,
        input.externalMessageId,
        input.externalChatId ?? null,
        input.rawPayload ?? null,
        input.sentAt.toISOString()
      ]
    );
  }

  async listByConversation(
    client: PoolClient,
    organizationId: string,
    conversationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<MessageRecord[]> {
    const assignedOnly = options?.assignedOnly ?? false;
    const organizationUserId = options?.organizationUserId ?? null;
    const result = await client.query<MessageRecord>(
      `
        select
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          external_message_id,
          external_chat_id,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          delivered_at,
          read_at,
          ack_status
        from messages
        where organization_id = $1
          and conversation_id = $2
          and (
            not $3::boolean
            or exists (
              select 1
              from conversations c
              where c.id = messages.conversation_id
                and (
                  c.assigned_user_id = $4
                  or exists (
                    select 1
                    from conversation_assignments ca
                    where ca.conversation_id = c.id
                      and ca.organization_user_id = $4
                  )
                )
            )
          )
        order by sent_at asc, id asc
      `,
      [organizationId, conversationId, assignedOnly, organizationUserId]
    );

    return result.rows;
  }
}
