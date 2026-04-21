import type { PoolClient } from "pg";

export interface RawChannelEventRecord {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  source: string;
  event_type: string;
  external_event_id: string | null;
  event_timestamp: string | null;
  received_at: string;
  payload: unknown;
  processing_status: "pending" | "processing" | "processed" | "failed" | "ignored";
  retry_count: number;
  error_message: string | null;
}

export class RawEventRepository {
  async list(
    client: PoolClient,
    input: {
      organizationId?: string | null;
      whatsappAccountId?: string | null;
      statuses?: Array<RawChannelEventRecord["processing_status"]>;
      limit?: number;
    }
  ): Promise<RawChannelEventRecord[]> {
    const conditions = ["1 = 1"];
    const values: Array<string | number | string[]> = [];

    if (input.organizationId) {
      values.push(input.organizationId);
      conditions.push(`organization_id = $${values.length}`);
    }

    if (input.whatsappAccountId) {
      values.push(input.whatsappAccountId);
      conditions.push(`whatsapp_account_id = $${values.length}`);
    }

    if (input.statuses && input.statuses.length > 0) {
      values.push(input.statuses);
      conditions.push(`processing_status = any($${values.length}::text[])`);
    }

    values.push(input.limit ?? 100);

    const result = await client.query<RawChannelEventRecord>(
      `
        select *
        from raw_channel_events
        where ${conditions.join(" and ")}
        order by received_at desc, id desc
        limit $${values.length}
      `,
      values
    );

    return result.rows;
  }

  async enqueue(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      source?: string;
      eventType: string;
      externalEventId?: string | null;
      eventTimestamp?: Date | null;
      payload: unknown;
    }
  ): Promise<RawChannelEventRecord> {
    const result = await client.query<RawChannelEventRecord>(
      `
        insert into raw_channel_events (
          organization_id,
          whatsapp_account_id,
          source,
          event_type,
          external_event_id,
          event_timestamp,
          payload
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        input.organizationId,
        input.whatsappAccountId,
        input.source ?? "whatsapp",
        input.eventType,
        input.externalEventId ?? null,
        input.eventTimestamp?.toISOString() ?? null,
        input.payload
      ]
    );

    return result.rows[0];
  }

  async resetStaleProcessing(client: PoolClient, staleBefore: Date): Promise<number> {
    const result = await client.query<{ count: string }>(
      `
        with updated as (
          update raw_channel_events
          set processing_status = 'pending',
              error_message = coalesce(error_message, 'Reset from stale processing state')
          where processing_status = 'processing'
            and received_at < $1
          returning 1
        )
        select count(*)::text as count
        from updated
      `,
      [staleBefore.toISOString()]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async claimPendingBatch(client: PoolClient, limit: number, maxRetries: number): Promise<RawChannelEventRecord[]> {
    const result = await client.query<RawChannelEventRecord>(
      `
        with claimed as (
          select id
          from raw_channel_events
          where (
              processing_status = 'pending'
              or (processing_status = 'failed' and retry_count < $2)
            )
          order by received_at asc
          limit $1
          for update skip locked
        )
        update raw_channel_events rce
        set processing_status = 'processing'
        from claimed
        where rce.id = claimed.id
        returning rce.*
      `,
      [limit, maxRetries]
    );

    return result.rows;
  }

  async findById(client: PoolClient, eventId: string): Promise<RawChannelEventRecord | null> {
    const result = await client.query<RawChannelEventRecord>(
      `
        select *
        from raw_channel_events
        where id = $1
        limit 1
      `,
      [eventId]
    );

    return result.rows[0] ?? null;
  }

  async markProcessed(client: PoolClient, eventId: string): Promise<void> {
    await client.query(
      `
        update raw_channel_events
        set processing_status = 'processed',
            error_message = null
        where id = $1
      `,
      [eventId]
    );
  }

  async markIgnored(client: PoolClient, eventId: string, message: string): Promise<void> {
    await client.query(
      `
        update raw_channel_events
        set processing_status = 'ignored',
            error_message = $2
        where id = $1
      `,
      [eventId, message]
    );
  }

  async markFailed(client: PoolClient, eventId: string, message: string): Promise<void> {
    await client.query(
      `
        update raw_channel_events
        set processing_status = 'failed',
            retry_count = retry_count + 1,
            error_message = $2
        where id = $1
      `,
      [eventId, message]
    );
  }

  async requeueByIds(client: PoolClient, eventIds: string[]): Promise<number> {
    if (eventIds.length === 0) {
      return 0;
    }

    const result = await client.query<{ count: string }>(
      `
        with updated as (
          update raw_channel_events
          set processing_status = 'pending',
              error_message = null
          where id = any($1::uuid[])
          returning 1
        )
        select count(*)::text as count
        from updated
      `,
      [eventIds]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async requeueByFilter(
    client: PoolClient,
    input: {
      organizationId?: string | null;
      whatsappAccountId?: string | null;
      statuses: Array<RawChannelEventRecord["processing_status"]>;
      limit?: number;
    }
  ): Promise<number> {
    const conditions = ["processing_status = any($1::text[])"];
    const values: Array<string[] | string | number> = [input.statuses];

    if (input.organizationId) {
      values.push(input.organizationId);
      conditions.push(`organization_id = $${values.length}`);
    }

    if (input.whatsappAccountId) {
      values.push(input.whatsappAccountId);
      conditions.push(`whatsapp_account_id = $${values.length}`);
    }

    values.push(input.limit ?? 100);

    const result = await client.query<{ count: string }>(
      `
        with targeted as (
          select id
          from raw_channel_events
          where ${conditions.join(" and ")}
          order by received_at asc
          limit $${values.length}
        ),
        updated as (
          update raw_channel_events
          set processing_status = 'pending',
              error_message = null
          where id in (select id from targeted)
          returning 1
        )
        select count(*)::text as count
        from updated
      `,
      values
    );

    return Number(result.rows[0]?.count ?? 0);
  }
}
