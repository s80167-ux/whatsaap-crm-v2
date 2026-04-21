import type { PoolClient } from "pg";

export class ProcessedEventKeyRepository {
  async createIfAbsent(
    client: PoolClient,
    input: {
      organizationId: string;
      source: string;
      eventKey: string;
    }
  ): Promise<boolean> {
    const result = await client.query<{ inserted: boolean }>(
      `
        with inserted as (
          insert into processed_event_keys (organization_id, source, event_key)
          values ($1, $2, $3)
          on conflict (event_key) do nothing
          returning true as inserted
        )
        select coalesce((select inserted from inserted limit 1), false) as inserted
      `,
      [input.organizationId, input.source, input.eventKey]
    );

    return result.rows[0]?.inserted ?? false;
  }
}
