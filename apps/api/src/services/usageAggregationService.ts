import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";

export class UsageAggregationService {
  async aggregateDay(usageDate: Date) {
    return withTransaction((client) => this.aggregateDayWithClient(client, usageDate));
  }

  async aggregateRecentDays(days = 7) {
    const dates: Date[] = [];

    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - offset);
      dates.push(date);
    }

    for (const date of dates) {
      await this.aggregateDay(date);
    }

    return dates.length;
  }

  async aggregateDayWithClient(client: PoolClient, usageDate: Date) {
    const result = await client.query<{ count: string }>(
      `
        with orgs as (
          select id as organization_id
          from organizations
        ),
        metrics as (
          select
            orgs.organization_id,
            $1::date as usage_date,
            (
              select count(*)::integer
              from messages m
              where m.organization_id = orgs.organization_id
                and m.direction = 'incoming'
                and m.sent_at >= $1::date
                and m.sent_at < ($1::date + interval '1 day')
            ) as inbound_messages,
            (
              select count(*)::integer
              from messages m
              where m.organization_id = orgs.organization_id
                and m.direction = 'outgoing'
                and m.sent_at >= $1::date
                and m.sent_at < ($1::date + interval '1 day')
            ) as outbound_messages,
            (
              select count(*)::integer
              from contacts c
              where c.organization_id = orgs.organization_id
                and c.last_activity_at is not null
                and c.last_activity_at >= $1::date
                and c.last_activity_at < ($1::date + interval '1 day')
            ) as active_contacts,
            (
              select count(*)::integer
              from whatsapp_accounts wa
              where wa.organization_id = orgs.organization_id
                and wa.connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required')
            ) as connected_whatsapp_accounts
          from orgs
        ),
        upserted as (
          insert into usage_daily (
            organization_id,
            usage_date,
            inbound_messages,
            outbound_messages,
            active_contacts,
            connected_whatsapp_accounts
          )
          select
            organization_id,
            usage_date,
            inbound_messages,
            outbound_messages,
            active_contacts,
            connected_whatsapp_accounts
          from metrics
          on conflict (organization_id, usage_date)
          do update set
            inbound_messages = excluded.inbound_messages,
            outbound_messages = excluded.outbound_messages,
            active_contacts = excluded.active_contacts,
            connected_whatsapp_accounts = excluded.connected_whatsapp_accounts
          returning 1
        )
        select count(*)::text as count
        from upserted
      `,
      [usageDate.toISOString()]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async getConnectorDiagnostics() {
    const client = await pool.connect();
    try {
      const [accountsResult, eventsResult] = await Promise.all([
        client.query<{
          id: string;
          organization_id: string;
          label: string | null;
          connection_status: string;
          connector_owner_id: string | null;
          connector_claimed_at: string | null;
          connector_heartbeat_at: string | null;
          health_score: string | null;
          latest_session_started_at: string | null;
          latest_session_connected_at: string | null;
          latest_session_ended_at: string | null;
          latest_session_end_reason: string | null;
        }>(
          `
            select
              wa.id,
              wa.organization_id,
              wa.label,
              wa.connection_status,
              wa.connector_owner_id,
              wa.connector_claimed_at,
              wa.connector_heartbeat_at,
              wa.health_score::text,
              ws.started_at as latest_session_started_at,
              ws.connected_at as latest_session_connected_at,
              ws.ended_at as latest_session_ended_at,
              ws.end_reason as latest_session_end_reason
            from whatsapp_accounts wa
            left join lateral (
              select started_at, connected_at, ended_at, end_reason
              from whatsapp_account_sessions ws
              where ws.whatsapp_account_id = wa.id
              order by ws.created_at desc, ws.id desc
              limit 1
            ) ws on true
            order by wa.updated_at desc, wa.id desc
            limit 50
          `
        ),
        client.query<{
          whatsapp_account_id: string;
          event_type: string;
          severity: string | null;
          created_at: string;
          payload: unknown;
        }>(
          `
            select
              whatsapp_account_id,
              event_type,
              severity,
              created_at,
              payload
            from whatsapp_connection_events
            order by created_at desc, id desc
            limit 50
          `
        )
      ]);

      return {
        accounts: accountsResult.rows,
        recent_events: eventsResult.rows
      };
    } finally {
      client.release();
    }
  }
}
