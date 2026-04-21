import type { PoolClient } from "pg";

export class RawEventRepository {
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
  ) {
    const result = await client.query<{ id: string }>(
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
        returning id
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
}
