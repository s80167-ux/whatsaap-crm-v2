import type { PoolClient } from "pg";

export interface WhatsAppSessionRecord {
  id: string;
  whatsapp_account_id: string;
  started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  reconnect_attempt_count: number;
  qr_generated_at: string | null;
  connected_at: string | null;
  metadata: unknown;
  created_at: string;
}

export class WhatsAppRuntimeRepository {
  async createSession(
    client: PoolClient,
    input: {
      whatsappAccountId: string;
      metadata?: unknown;
    }
  ): Promise<WhatsAppSessionRecord> {
    const result = await client.query<WhatsAppSessionRecord>(
      `
        insert into whatsapp_account_sessions (
          whatsapp_account_id,
          started_at,
          metadata
        )
        values ($1, timezone('utc', now()), $2)
        returning *
      `,
      [input.whatsappAccountId, input.metadata ?? null]
    );

    return result.rows[0];
  }

  async touchQrGenerated(client: PoolClient, sessionId: string): Promise<void> {
    await client.query(
      `
        update whatsapp_account_sessions
        set qr_generated_at = coalesce(qr_generated_at, timezone('utc', now()))
        where id = $1
      `,
      [sessionId]
    );
  }

  async touchConnected(client: PoolClient, sessionId: string): Promise<void> {
    await client.query(
      `
        update whatsapp_account_sessions
        set connected_at = coalesce(connected_at, timezone('utc', now()))
        where id = $1
      `,
      [sessionId]
    );
  }

  async incrementReconnectAttempts(client: PoolClient, sessionId: string): Promise<void> {
    await client.query(
      `
        update whatsapp_account_sessions
        set reconnect_attempt_count = reconnect_attempt_count + 1
        where id = $1
      `,
      [sessionId]
    );
  }

  async endSession(client: PoolClient, input: { sessionId: string; reason: string | null }): Promise<void> {
    await client.query(
      `
        update whatsapp_account_sessions
        set ended_at = coalesce(ended_at, timezone('utc', now())),
            end_reason = coalesce($2, end_reason)
        where id = $1
      `,
      [input.sessionId, input.reason]
    );
  }

  async appendConnectionEvent(
    client: PoolClient,
    input: {
      whatsappAccountId: string;
      sessionId?: string | null;
      eventType: string;
      severity?: string | null;
      payload?: unknown;
    }
  ): Promise<void> {
    await client.query(
      `
        insert into whatsapp_connection_events (
          whatsapp_account_id,
          session_id,
          event_type,
          severity,
          payload
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        input.whatsappAccountId,
        input.sessionId ?? null,
        input.eventType,
        input.severity ?? null,
        input.payload ?? null
      ]
    );
  }
}
