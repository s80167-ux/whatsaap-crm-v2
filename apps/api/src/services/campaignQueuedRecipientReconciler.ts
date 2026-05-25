import { query } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { CampaignSafetyService } from "./campaignSafetyService.js";

export class CampaignQueuedRecipientReconciler {
  async reconcile(limit = env.MESSAGE_OUTBOX_WORKER_BATCH_SIZE) {
    const safeLimit = Math.max(1, limit);

    const sentCount = await this.markDispatchedRecipientsAsSent(safeLimit);
    const failedCount = await this.markExhaustedRecipientsAsFailed(safeLimit);
    const repairedCount = await this.requeueStaleQueuedRecipientsWithoutOutbox(safeLimit);

    const changedCount = sentCount + failedCount + repairedCount;

    if (changedCount > 0) {
      logger.info({ sentCount, failedCount, repairedCount }, "Reconciled queued campaign recipients");
    }

    return { sentCount, failedCount, repairedCount };
  }

  private async markDispatchedRecipientsAsSent(limit: number) {
    const result = await query<{ campaign_id: string; organization_id: string }>(
      `
        with candidates as (
          select
            cr.id,
            cr.organization_id,
            cr.campaign_id,
            coalesce(o.dispatched_at, m.sent_at, timezone('utc', now())) as sent_at
          from campaign_recipients cr
          join messages m on m.id = cr.message_id
          left join message_dispatch_outbox o on o.message_id = cr.message_id
          where cr.send_status = 'queued'
            and cr.message_id is not null
            and (
              o.processing_status = 'dispatched'
              or m.ack_status in ('server_ack', 'device_delivered', 'read', 'played')
            )
          order by coalesce(o.dispatched_at, m.sent_at, cr.queued_at, cr.created_at) asc
          limit $1
        ), updated as (
          update campaign_recipients cr
          set send_status = 'sent',
              sent_at = candidates.sent_at,
              failed_at = null,
              next_attempt_at = null,
              error_message = null,
              failure_code = null,
              failure_reason = null,
              last_attempt_at = coalesce(cr.last_attempt_at, candidates.sent_at)
          from candidates
          where cr.id = candidates.id
          returning cr.organization_id, cr.campaign_id
        )
        select distinct organization_id, campaign_id from updated
      `,
      [limit]
    );

    await this.refreshImpactedCampaigns(result.rows);
    return result.rowCount ?? result.rows.length;
  }

  private async markExhaustedRecipientsAsFailed(limit: number) {
    const result = await query<{ campaign_id: string; organization_id: string }>(
      `
        with candidates as (
          select
            cr.id,
            cr.organization_id,
            cr.campaign_id,
            coalesce(o.last_error, 'Message dispatch did not complete') as error_message
          from campaign_recipients cr
          left join message_dispatch_outbox o on o.message_id = cr.message_id
          left join messages m on m.id = cr.message_id
          where cr.send_status = 'queued'
            and cr.message_id is not null
            and (
              m.ack_status = 'failed'
              or (
                o.processing_status = 'failed'
                and o.next_attempt_at is null
                and o.attempt_count >= $2
              )
            )
          order by coalesce(o.updated_at, cr.queued_at, cr.created_at) asc
          limit $1
        ), updated as (
          update campaign_recipients cr
          set send_status = 'failed',
              failed_at = timezone('utc', now()),
              next_attempt_at = null,
              error_message = candidates.error_message,
              failure_code = 'send_failed',
              failure_reason = candidates.error_message,
              last_attempt_at = timezone('utc', now())
          from candidates
          where cr.id = candidates.id
          returning cr.organization_id, cr.campaign_id
        )
        select distinct organization_id, campaign_id from updated
      `,
      [limit, env.MESSAGE_OUTBOX_WORKER_MAX_RETRIES]
    );

    await this.refreshImpactedCampaigns(result.rows);
    return result.rowCount ?? result.rows.length;
  }

  private async requeueStaleQueuedRecipientsWithoutOutbox(limit: number) {
    const staleBefore = new Date(Date.now() - env.MESSAGE_OUTBOX_WORKER_STALE_AFTER_MS).toISOString();
    const result = await query<{ campaign_id: string; organization_id: string }>(
      `
        with candidates as (
          select cr.id, cr.organization_id, cr.campaign_id
          from campaign_recipients cr
          left join message_dispatch_outbox o on o.message_id = cr.message_id
          left join messages m on m.id = cr.message_id
          where cr.send_status = 'queued'
            and cr.message_id is not null
            and o.id is null
            and (
              m.id is null
              or m.ack_status = 'failed'
              or (
                m.ack_status = 'pending'
                and m.external_message_id like 'queued:%'
                and coalesce(cr.queued_at, cr.created_at) < $2::timestamptz
              )
            )
          order by coalesce(cr.queued_at, cr.created_at) asc
          limit $1
        ), updated as (
          update campaign_recipients cr
          set send_status = case
                when cr.attempt_count < $3 then 'pending'
                else 'failed'
              end,
              queued_at = null,
              message_id = null,
              failed_at = case
                when cr.attempt_count < $3 then null
                else timezone('utc', now())
              end,
              next_attempt_at = case
                when cr.attempt_count < $3 then timezone('utc', now())
                else null
              end,
              error_message = case
                when cr.attempt_count < $3 then 'Queued campaign message lost its outbox job and was requeued'
                else 'Queued campaign message lost its outbox job after all retries'
              end,
              failure_code = case
                when cr.attempt_count < $3 then null
                else 'send_failed'
              end,
              failure_reason = case
                when cr.attempt_count < $3 then null
                else 'Queued campaign message lost its outbox job after all retries'
              end,
              last_attempt_at = timezone('utc', now())
          from candidates
          where cr.id = candidates.id
          returning cr.organization_id, cr.campaign_id
        )
        select distinct organization_id, campaign_id from updated
      `,
      [limit, staleBefore, env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES]
    );

    await this.refreshImpactedCampaigns(result.rows);
    return result.rowCount ?? result.rows.length;
  }

  private async refreshImpactedCampaigns(rows: Array<{ organization_id: string; campaign_id: string }>) {
    const seen = new Set<string>();

    for (const row of rows) {
      const key = `${row.organization_id}:${row.campaign_id}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      await CampaignSafetyService.autoPauseCampaignIfNeeded(row.organization_id, row.campaign_id);
      await this.refreshCampaignCompletion(row.organization_id, row.campaign_id);
    }
  }

  private async refreshCampaignCompletion(organizationId: string, campaignId: string) {
    await query(
      `
        with counts as (
          select
            count(*) filter (where send_status in ('pending', 'queued')) as open_count,
            count(*) filter (
              where send_status = 'failed'
                and attempt_count < $3
            ) as retryable_failed_count,
            count(*) filter (where send_status = 'sent') as sent_count
          from campaign_recipients
          where organization_id = $1
            and campaign_id = $2
        )
        update campaigns
        set status = case
              when counts.open_count = 0 and counts.retryable_failed_count = 0 and counts.sent_count > 0 then 'completed'
              when counts.open_count = 0 and counts.retryable_failed_count = 0 and counts.sent_count = 0 then 'failed'
              else campaigns.status
            end,
            updated_at = timezone('utc', now())
        from counts
        where campaigns.organization_id = $1
          and campaigns.id = $2
          and campaigns.status = 'sending'
      `,
      [organizationId, campaignId, env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES]
    );
  }
}
