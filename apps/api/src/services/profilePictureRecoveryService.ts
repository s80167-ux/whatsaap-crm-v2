import type { PoolClient } from "pg";
import { logger } from "../config/logger.js";
import { withTransaction } from "../config/database.js";
import { normalizeWhatsAppIdentity } from "../utils/whatsappIdentity.js";
import { ConnectorClient } from "./connectorClient.js";
import { ContactEnrichmentCacheService } from "./contactEnrichmentCacheService.js";
import { ContactRecoveryAuditService } from "./contactRecoveryAuditService.js";

export class ProfilePictureRecoveryService {
  constructor(
    private readonly connectorClient = new ConnectorClient(),
    private readonly cacheService = new ContactEnrichmentCacheService(),
    private readonly auditService = new ContactRecoveryAuditService()
  ) {}

  async queueProfilePictureFetch(
    client: PoolClient,
    input: { organizationId: string; whatsappAccountId: string; contactId?: string | null; jid: string }
  ) {
    const identity = normalizeWhatsAppIdentity(input.jid);
    if (!identity.isValidCustomerIdentity || !identity.normalizedJid) {
      return { queued: false };
    }

    const result = await client.query(
      `
        insert into wa_profile_fetch_jobs (
          organization_id,
          whatsapp_account_id,
          contact_id,
          jid
        )
        values ($1, $2, $3, $4)
        on conflict do nothing
        returning *
      `,
      [input.organizationId, input.whatsappAccountId, input.contactId ?? null, identity.normalizedJid]
    );

    const queued = Boolean(result.rows[0]);
    if (queued) {
      await this.auditService.record(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        contactId: input.contactId ?? null,
        action: "profile_picture_queued",
        source: "profile_picture_job",
        afterData: result.rows[0],
        reason: "Contact has a valid WhatsApp JID but missing profile picture"
      });
    }

    return { queued };
  }

  async processPendingProfilePictureJobs(input: { organizationId?: string; whatsappAccountId?: string; limit?: number } = {}) {
    const jobs = await withTransaction(async (client) => {
      const result = await client.query(
        `
          update wa_profile_fetch_jobs
          set status = 'processing'
          where id in (
            select id
            from wa_profile_fetch_jobs
            where status = 'pending'
              and attempts < 3
              and next_attempt_at <= timezone('utc', now())
              and ($1::uuid is null or organization_id = $1)
              and ($2::uuid is null or whatsapp_account_id = $2)
            order by next_attempt_at asc, created_at asc
            limit $3
            for update skip locked
          )
          returning *
        `,
        [input.organizationId ?? null, input.whatsappAccountId ?? null, input.limit ?? 25]
      );
      return result.rows;
    });

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const result = await this.connectorClient.fetchProfilePicture(job.whatsapp_account_id, job.jid);

        if (result.profilePicUrl) {
          await withTransaction(async (client) => {
            const contactBefore = await client.query(
              `select id, primary_avatar_url from contacts where id = $1 and organization_id = $2 limit 1`,
              [job.contact_id, job.organization_id]
            );
            await client.query(
              `
                update contacts
                set primary_avatar_url = coalesce(nullif(trim(primary_avatar_url), ''), $3),
                    updated_at = timezone('utc', now())
                where id = $1
                  and organization_id = $2
              `,
              [job.contact_id, job.organization_id, result.profilePicUrl]
            );
            await this.cacheService.updateLastKnownGood(client, {
              organizationId: job.organization_id,
              whatsappAccountId: job.whatsapp_account_id,
              contactId: job.contact_id,
              rawJid: job.jid,
              normalizedJid: job.jid,
              profilePicUrl: result.profilePicUrl,
              source: "active_profile_fetch",
              rawPayload: result
            });
            await client.query(
              `
                update wa_profile_fetch_jobs
                set status = 'completed',
                    completed_at = timezone('utc', now()),
                    last_error = null
                where id = $1
              `,
              [job.id]
            );
            await this.auditService.record(client, {
              organizationId: job.organization_id,
              whatsappAccountId: job.whatsapp_account_id,
              contactId: job.contact_id,
              action: "profile_picture_restored",
              source: "active_profile_fetch",
              beforeData: contactBefore.rows[0] ?? null,
              afterData: { profilePicUrl: result.profilePicUrl },
              rawPayload: result
            });
          });
          completed += 1;
          continue;
        }

        throw new Error("WhatsApp returned no profile picture URL");
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Profile picture fetch failed";
        logger.warn({ error, jobId: job.id }, "Profile picture recovery job failed");
        await withTransaction(async (client) => {
          await client.query(
            `
              update wa_profile_fetch_jobs
              set attempts = attempts + 1,
                  status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
                  last_error = $2,
                  next_attempt_at = timezone('utc', now()) + interval '24 hours'
              where id = $1
            `,
            [job.id, message]
          );
        });
      }
    }

    return { claimed: jobs.length, completed, failed };
  }
}
