import type { PoolClient } from "pg";

export interface MessageDispatchOutboxRecord {
  id: string;
  organization_id: string;
  message_id: string;
  conversation_id: string;
  contact_id: string;
  whatsapp_account_id: string;
  recipient_jid: string;
  message_text: string;
  payload: unknown;
  processing_status: "pending" | "processing" | "dispatched" | "failed";
  attempt_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  claimed_at: string | null;
  dispatched_at: string | null;
  connector_message_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class MessageDispatchOutboxRepository {
  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      messageId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      recipientJid: string;
      messageText: string;
      payload?: unknown;
    }
  ): Promise<MessageDispatchOutboxRecord> {
    const result = await client.query<MessageDispatchOutboxRecord>(
      `
        insert into message_dispatch_outbox (
          organization_id,
          message_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          recipient_jid,
          message_text,
          payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (message_id)
        do update set
          recipient_jid = excluded.recipient_jid,
          message_text = excluded.message_text,
          payload = excluded.payload
        returning *
      `,
      [
        input.organizationId,
        input.messageId,
        input.conversationId,
        input.contactId,
        input.whatsappAccountId,
        input.recipientJid,
        input.messageText,
        input.payload ?? null
      ]
    );

    return result.rows[0];
  }

  async resetStaleProcessing(client: PoolClient, staleBefore: Date) {
    await client.query(
      `
        update message_dispatch_outbox
        set processing_status = 'pending',
            claimed_at = null,
            updated_at = timezone('utc', now())
        where processing_status = 'processing'
          and claimed_at < $1
      `,
      [staleBefore.toISOString()]
    );
  }

  async claimPendingBatch(client: PoolClient, limit: number, maxRetries: number): Promise<MessageDispatchOutboxRecord[]> {
    const result = await client.query<MessageDispatchOutboxRecord>(
      `
        with candidates as (
          select id
          from message_dispatch_outbox
          where processing_status in ('pending', 'failed')
            and attempt_count < $2
            and coalesce(next_attempt_at, timezone('utc', now())) <= timezone('utc', now())
          order by created_at asc
          for update skip locked
          limit $1
        )
        update message_dispatch_outbox o
        set processing_status = 'processing',
            attempt_count = o.attempt_count + 1,
            last_attempt_at = timezone('utc', now()),
            claimed_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        from candidates
        where o.id = candidates.id
        returning o.*
      `,
      [limit, maxRetries]
    );

    return result.rows;
  }

  async markDispatched(
    client: PoolClient,
    input: {
      outboxId: string;
      connectorMessageId: string | null;
      payload?: unknown;
    }
  ) {
    await client.query(
      `
        update message_dispatch_outbox
        set processing_status = 'dispatched',
            dispatched_at = timezone('utc', now()),
            claimed_at = null,
            connector_message_id = coalesce($2, connector_message_id),
            payload = coalesce($3, payload),
            last_error = null,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [input.outboxId, input.connectorMessageId, input.payload ?? null]
    );
  }

  async markFailed(
    client: PoolClient,
    input: {
      outboxId: string;
      errorMessage: string;
      nextAttemptAt: Date;
      payload?: unknown;
    }
  ) {
    await client.query(
      `
        update message_dispatch_outbox
        set processing_status = 'failed',
            claimed_at = null,
            next_attempt_at = $2,
            last_error = $3,
            payload = coalesce($4, payload),
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [input.outboxId, input.nextAttemptAt.toISOString(), input.errorMessage, input.payload ?? null]
    );
  }

  async requeueByIds(client: PoolClient, outboxIds: string[]): Promise<number> {
    if (outboxIds.length === 0) {
      return 0;
    }

    const result = await client.query<{ id: string }>(
      `
        update message_dispatch_outbox
        set processing_status = 'pending',
            claimed_at = null,
            next_attempt_at = timezone('utc', now()),
            last_error = null,
            updated_at = timezone('utc', now())
        where id = any($1::uuid[])
        returning id
      `,
      [outboxIds]
    );

    return result.rowCount ?? result.rows.length;
  }

  async listFailed(client: PoolClient, limit: number): Promise<Array<{ id: string }>> {
    const result = await client.query<{ id: string }>(
      `
        select id
        from message_dispatch_outbox
        where processing_status = 'failed'
        order by created_at asc
        limit $1
      `,
      [limit]
    );

    return result.rows;
  }

  async findRetryableByMessageId(
    client: PoolClient,
    input: {
      messageId: string;
      organizationId: string;
    }
  ): Promise<MessageDispatchOutboxRecord | null> {
    const result = await client.query<MessageDispatchOutboxRecord>(
      `
        select *
        from message_dispatch_outbox
        where message_id = $1
          and organization_id = $2
          and processing_status in ('pending', 'failed')
        limit 1
      `,
      [input.messageId, input.organizationId]
    );

    return result.rows[0] ?? null;
  }
}
