import { query, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";

export class WhatsAppAccountHealthService {
  async refreshAll(organizationId?: string) {
    try {
      const orgFilter = organizationId ? "where organization_id = $1" : "";
      const params = organizationId ? [organizationId] : [];

      const accounts = await query<{ id: string; organization_id: string }>(
        `
          select id, organization_id
          from whatsapp_accounts
          ${orgFilter}
        `,
        params
      );

      for (const account of accounts.rows) {
        await this.refreshAccount(account.organization_id, account.id);
      }

      logger.info({ count: accounts.rows.length }, "Refreshed WhatsApp account health scores");
    } catch (err) {
      logger.error({ err }, "Failed to refresh WhatsApp account health scores");
    }
  }

  async refreshAccount(organizationId: string, accountId: string) {
    return withTransaction(async (client) => {
      const result = await client.query<{
        sent: string;
        delivered: string;
        read: string;
        failed: string;
        health_score_computed_at: string | null;
      }>(
        `
          select
            count(*) filter (where cr.send_status = 'sent')::text as sent,
            count(distinct mse.message_id) filter (where mse.status = 'delivered')::text as delivered,
            count(distinct mse.message_id) filter (where mse.status = 'read')::text as read,
            count(*) filter (where cr.send_status = 'failed')::text as failed,
            wa.health_score_computed_at
          from whatsapp_accounts wa
          left join campaign_recipients cr
            on cr.assigned_whatsapp_account_id = wa.id
            and cr.last_attempt_at >= timezone('utc', now()) - interval '7 days'
          left join messages m on m.id = cr.message_id
          left join message_status_events mse on mse.message_id = m.id
          where wa.organization_id = $1
            and wa.id = $2
          group by wa.id, wa.health_score_computed_at
        `,
        [organizationId, accountId]
      );

      const row = result.rows[0];
      if (!row) return;

      const sent = Number(row.sent ?? 0);
      const delivered = Number(row.delivered ?? 0);
      const read = Number(row.read ?? 0);
      const failed = Number(row.failed ?? 0);

      let score: number;
      if (sent === 0) {
        // Decay existing score if no sends in 7 days
        const lastComputed = row.health_score_computed_at ? new Date(row.health_score_computed_at).getTime() : 0;
        const daysSinceComputed = lastComputed ? Math.floor((Date.now() - lastComputed) / (1000 * 60 * 60 * 24)) : 7;
        score = Math.max(0, 50 - daysSinceComputed * 10);
      } else {
        const readRate = sent > 0 ? read / sent : 0;
        const deliveryRate = sent > 0 ? delivered / sent : 0;
        const failureRate = sent + failed > 0 ? failed / (sent + failed) : 0;
        score = readRate * 60 + deliveryRate * 30 + (1 - failureRate) * 10;
        score = Math.max(0, Math.min(100, score));
      }

      await client.query(
        `
          update whatsapp_accounts
          set health_score = $3,
              health_score_computed_at = timezone('utc', now()),
              updated_at = timezone('utc', now())
          where organization_id = $1
            and id = $2
        `,
        [organizationId, accountId, score]
      );
    });
  }
}
