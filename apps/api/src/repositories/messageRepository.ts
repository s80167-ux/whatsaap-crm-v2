import type { PoolClient } from "pg";
import type { MessageRecord } from "../types/domain.js";

export interface MessagePaginationCursor {
  sentAt: string;
  id: string;
}

export interface MessagePaginationResult {
  messages: MessageRecord[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextBefore: MessagePaginationCursor | null;
  };
}

export interface MessageReplyPreviewRow {
  id: string;
  preview_text: string | null;
}

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
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          created_at,
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
      replyToMessageId?: string | null;
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
          social_channel_account_id,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          channel,
          direction,
          message_type,
          content_text,
          content_json,
          ack_status,
          sent_at
        )
        values ($1, $2, $3, $4, null, $5, $6, $7, 'whatsapp', 'outgoing', $8, nullif($9, ''), $10, 'pending', $11)
        returning
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          created_at,
          coalesce(sent_at, created_at) as sort_at,
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
        input.replyToMessageId ?? null,
        input.messageType ?? "text",
        input.contentText ?? null,
        input.contentJson ?? null,
        input.sentAt.toISOString()
      ]
    );

    return result.rows[0];
  }

  async updateInboundMediaAttachment(
    client: PoolClient,
    input: {
      messageId: string;
      mediaAttachment: unknown;
    }
  ): Promise<void> {
    await client.query(
      `
        update messages
        set content_json = case
              when $2::jsonb is null then content_json
              when content_json is null then jsonb_build_object('outboundMedia', $2::jsonb)
              else content_json || jsonb_build_object('outboundMedia', $2::jsonb)
            end,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [input.messageId, input.mediaAttachment ?? null]
    );
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
              when $2::text = 'failed' and coalesce(ack_status, 'pending') in ('pending', 'failed') then 'failed'
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
            content_json = case
              when $4::jsonb is null then content_json
              when content_json is null then jsonb_build_object('rawPayload', $4::jsonb)
              else content_json || jsonb_build_object('rawPayload', $4::jsonb)
            end,
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

  async findRecentQueuedOutboundDraft(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      externalChatId: string;
      contentText: string | null;
      sentAt: Date;
      windowMinutes?: number;
    }
  ): Promise<MessageRecord | null> {
    const windowMinutes = input.windowMinutes ?? 10;
    const result = await client.query<MessageRecord>(
      `
        select
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
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
          and contact_id = $3
          and whatsapp_account_id = $4
          and external_chat_id = $5
          and direction = 'outgoing'
          and is_deleted = false
          and external_message_id like 'queued:%'
          and sent_at between $7::timestamptz - ($8::int * interval '1 minute')
                          and $7::timestamptz + ($8::int * interval '1 minute')
          and (
            nullif($6::text, '') is null
            or content_text = $6
            or content_text is null
          )
        order by abs(extract(epoch from (sent_at - $7::timestamptz))) asc, sent_at desc
        limit 1
      `,
      [
        input.organizationId,
        input.conversationId,
        input.contactId,
        input.whatsappAccountId,
        input.externalChatId,
        input.contentText ?? null,
        input.sentAt.toISOString(),
        windowMinutes
      ]
    );

    return result.rows[0] ?? null;
  }

  async listByConversation(
    client: PoolClient,
    organizationId: string | null,
    conversationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
      activityRange?: {
        since: string;
      };
    }
  ): Promise<MessageRecord[]> {
    const assignedOnly = options?.assignedOnly ?? false;
    const organizationUserId = options?.organizationUserId ?? null;
    const activitySince = options?.activityRange?.since ?? null;
    const result = await client.query<MessageRecord>(
      `
        select
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          created_at,
          coalesce(sent_at, created_at) as sort_at,
          delivered_at,
          read_at,
          ack_status
        from messages
        where ($1::uuid is null or organization_id = $1)
          and conversation_id = $2
          and ($5::timestamptz is null or coalesce(sent_at, created_at) >= $5::timestamptz)
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
                  or exists (
                    select 1
                    from whatsapp_account_user_access wau
                    where wau.organization_id = c.organization_id
                      and wau.whatsapp_account_id = c.whatsapp_account_id
                      and wau.organization_user_id = $4
                      and wau.is_active = true
                      and wau.can_view = true
                  )
                )
            )
          )
        order by coalesce(sent_at, created_at) asc, id asc
      `,
      [organizationId, conversationId, assignedOnly, organizationUserId, activitySince]
    );

    return result.rows;
  }

  async listReplyPreviews(
    client: PoolClient,
    input: {
      organizationId: string | null;
      messageIds: string[];
    }
  ): Promise<MessageReplyPreviewRow[]> {
    if (input.messageIds.length === 0) {
      return [];
    }

    const result = await client.query<MessageReplyPreviewRow>(
      `
        select
          id,
          left(coalesce(nullif(content_text, ''), message_type, 'message'), 160) as preview_text
        from messages
        where ($1::uuid is null or organization_id = $1)
          and id = any($2::uuid[])
          and is_deleted = false
      `,
      [input.organizationId, input.messageIds]
    );

    return result.rows;
  }

  async listByConversationPage(
    client: PoolClient,
    organizationId: string | null,
    conversationId: string,
    options: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
      activityRange?: {
        since: string;
      };
      limit: number;
      before?: MessagePaginationCursor | null;
    }
  ): Promise<MessagePaginationResult> {
    const assignedOnly = options.assignedOnly ?? false;
    const organizationUserId = options.organizationUserId ?? null;
    const activitySince = options.activityRange?.since ?? null;
    const beforeSentAt = options.before?.sentAt ?? null;
    const beforeId = options.before?.id ?? null;
    const fetchLimit = options.limit + 1;
    const result = await client.query<MessageRecord>(
      `
        select
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          created_at,
          coalesce(sent_at, created_at) as sort_at,
          delivered_at,
          read_at,
          ack_status
        from messages
        where ($1::uuid is null or organization_id = $1)
          and conversation_id = $2
          and ($5::timestamptz is null or coalesce(sent_at, created_at) >= $5::timestamptz)
          and (
            $6::timestamptz is null
            or coalesce(sent_at, created_at) < $6::timestamptz
            or (coalesce(sent_at, created_at) = $6::timestamptz and id < $7::uuid)
          )
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
                  or exists (
                    select 1
                    from whatsapp_account_user_access wau
                    where wau.organization_id = c.organization_id
                      and wau.whatsapp_account_id = c.whatsapp_account_id
                      and wau.organization_user_id = $4
                      and wau.is_active = true
                      and wau.can_view = true
                  )
                )
            )
          )
        order by coalesce(sent_at, created_at) desc, id desc
        limit $8
      `,
      [
        organizationId,
        conversationId,
        assignedOnly,
        organizationUserId,
        activitySince,
        beforeSentAt,
        beforeId,
        fetchLimit
      ]
    );

    const hasMore = result.rows.length > options.limit;
    const pageRows = result.rows.slice(0, options.limit).reverse();
    const oldestMessage = pageRows[0] ?? null;

    return {
      messages: pageRows,
      pagination: {
        limit: options.limit,
        hasMore,
        nextBefore: oldestMessage
          ? {
              sentAt: oldestMessage.sort_at ?? oldestMessage.sent_at,
              id: oldestMessage.id
            }
          : null
      }
    };
  }

  async findById(
    client: PoolClient,
    input: {
      organizationId: string;
      messageId: string;
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
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
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
          and id = $2
          and is_deleted = false
        limit 1
      `,
      [input.organizationId, input.messageId]
    );

    return result.rows[0] ?? null;
  }

  async findByIdAnyOrganization(
    client: PoolClient,
    input: {
      messageId: string;
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
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          delivered_at,
          read_at,
          ack_status
        from messages
        where id = $1
          and is_deleted = false
        limit 1
      `,
      [input.messageId]
    );

    return result.rows[0] ?? null;
  }

  async markDeleted(
    client: PoolClient,
    input: {
      organizationId: string;
      messageId: string;
    }
  ): Promise<MessageRecord | null> {
    const result = await client.query<MessageRecord>(
      `
        update messages
        set is_deleted = true,
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
          and is_deleted = false
        returning
          id,
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          social_channel_account_id,
          channel,
          external_message_id,
          external_chat_id,
          reply_to_message_id,
          is_deleted,
          direction,
          message_type,
          content_text,
          content_json,
          sent_at,
          delivered_at,
          read_at,
          ack_status
      `,
      [input.organizationId, input.messageId]
    );

    return result.rows[0] ?? null;
  }
}
