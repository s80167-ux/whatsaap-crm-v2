import { pool, query, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ContactService } from "./contactService.js";
import { ConversationService } from "./conversationService.js";
import { SendMessageService } from "./sendMessageService.js";
import { normalizePhoneNumber } from "../utils/phone.js";

type CampaignDispatchCandidate = {
  id: string;
  organization_id: string;
  sender_whatsapp_account_id: string;
  message_template: string;
  delay_per_message_seconds: number;
  batch_size: number;
  batch_pause_seconds: number;
  daily_limit: number;
  last_queued_at: string | null;
  dispatched_count: string;
  today_count: string;
};

type ClaimedCampaignRecipient = {
  id: string;
  organization_id: string;
  campaign_id: string;
  name: string | null;
  phone_normalized: string;
  gender: string | null;
  salutation: string | null;
  tag: string | null;
  location: string | null;
  product_interest: string | null;
  customer_type: string | null;
  notes: string | null;
  attempt_count: number;
  sender_whatsapp_account_id: string;
  message_template: string;
};

export class CampaignDispatchService {
  constructor(
    private readonly contactService = new ContactService(),
    private readonly conversationService = new ConversationService(),
    private readonly sendMessageService = new SendMessageService()
  ) {}

  async processPendingBatch(limit = env.CAMPAIGN_DISPATCH_WORKER_BATCH_SIZE) {
    await this.resetStaleClaims();

    let processed = 0;

    for (let index = 0; index < limit; index += 1) {
      const recipient = await this.claimNextDueRecipient();

      if (!recipient) {
        break;
      }

      await this.processRecipient(recipient);
      processed += 1;
    }

    return processed;
  }

  private async resetStaleClaims() {
    const staleBefore = new Date(Date.now() - env.CAMPAIGN_DISPATCH_WORKER_STALE_AFTER_MS);

    await query(
      `
        update campaign_recipients
        set send_status = 'pending',
            queued_at = null,
            error_message = null
        where send_status = 'queued'
          and message_id is null
          and queued_at < $1
      `,
      [staleBefore.toISOString()]
    );
  }

  private async claimNextDueRecipient() {
    const candidates = await query<CampaignDispatchCandidate>(
      `
        select
          c.id,
          c.organization_id,
          c.sender_whatsapp_account_id,
          c.message_template,
          c.delay_per_message_seconds,
          c.batch_size,
          c.batch_pause_seconds,
          c.daily_limit,
          max(cr.queued_at) filter (where cr.send_status in ('queued', 'sent')) as last_queued_at,
          count(*) filter (where cr.send_status in ('queued', 'sent'))::text as dispatched_count,
          count(*) filter (
            where cr.send_status in ('queued', 'sent')
              and cr.queued_at >= date_trunc('day', timezone('utc', now()))
          )::text as today_count
        from campaigns c
        join campaign_recipients cr on cr.campaign_id = c.id
        where c.status = 'sending'
          and c.sender_whatsapp_account_id is not null
          and c.message_template is not null
          and cr.send_status in ('pending', 'failed')
          and cr.attempt_count < $1
          and coalesce(cr.next_attempt_at, timezone('utc', now())) <= timezone('utc', now())
        group by c.id
        order by c.updated_at asc, c.created_at asc
        limit 50
      `,
      [env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES]
    );

    const now = Date.now();

    for (const campaign of candidates.rows) {
      const todayCount = Number(campaign.today_count);

      if (todayCount >= campaign.daily_limit) {
        continue;
      }

      const dispatchedCount = Number(campaign.dispatched_count);
      const waitSeconds =
        dispatchedCount > 0 && dispatchedCount % campaign.batch_size === 0
          ? campaign.batch_pause_seconds
          : campaign.delay_per_message_seconds;

      if (campaign.last_queued_at) {
        const nextAllowedAt = new Date(campaign.last_queued_at).getTime() + waitSeconds * 1000;

        if (now < nextAllowedAt) {
          continue;
        }
      }

      const claimed = await this.claimRecipientForCampaign(campaign.id);

      if (claimed) {
        return claimed;
      }
    }

    return null;
  }

  private async claimRecipientForCampaign(campaignId: string) {
    return withTransaction(async (client) => {
      const result = await client.query<ClaimedCampaignRecipient>(
        `
          with candidate as (
            select cr.id
            from campaign_recipients cr
            where cr.campaign_id = $1
              and cr.send_status in ('pending', 'failed')
              and cr.attempt_count < $2
              and coalesce(cr.next_attempt_at, timezone('utc', now())) <= timezone('utc', now())
            order by coalesce(cr.next_attempt_at, cr.created_at) asc, cr.created_at asc
            for update skip locked
            limit 1
          )
          update campaign_recipients cr
          set send_status = 'queued',
              attempt_count = cr.attempt_count + 1,
              queued_at = timezone('utc', now()),
              failed_at = null,
              next_attempt_at = null,
              error_message = null
          from candidate
          join campaigns c on c.id = $1
          where cr.id = candidate.id
            and c.id = cr.campaign_id
            and c.status = 'sending'
            and c.sender_whatsapp_account_id is not null
            and c.message_template is not null
          returning
            cr.id,
            cr.organization_id,
            cr.campaign_id,
            cr.name,
            cr.phone_normalized,
            cr.gender,
            cr.salutation,
            cr.tag,
            cr.location,
            cr.product_interest,
            cr.customer_type,
            cr.notes,
            cr.attempt_count,
            c.sender_whatsapp_account_id,
            c.message_template
        `,
        [campaignId, env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES]
      );

      return result.rows[0] ?? null;
    });
  }

  private async processRecipient(recipient: ClaimedCampaignRecipient) {
    try {
      const message = await this.sendCampaignRecipientMessage({
        organizationId: recipient.organization_id,
        campaignId: recipient.campaign_id,
        campaignRecipientId: recipient.id,
        senderWhatsAppAccountId: recipient.sender_whatsapp_account_id,
        phoneNumber: recipient.phone_normalized,
        profileName: recipient.name,
        text: renderCampaignMessage(recipient.message_template, {
          name: recipient.name,
          phone: recipient.phone_normalized,
          gender: recipient.gender,
          salutation: recipient.salutation,
          tag: recipient.tag,
          location: recipient.location,
          product_interest: recipient.product_interest,
          customer_type: recipient.customer_type,
          notes: recipient.notes
        })
      });

      await query(
        `
          update campaign_recipients
          set send_status = 'sent',
              message_id = $4,
              sent_at = timezone('utc', now()),
              failed_at = null,
              next_attempt_at = null,
              error_message = null
          where organization_id = $1
            and campaign_id = $2
            and id = $3
        `,
        [recipient.organization_id, recipient.campaign_id, recipient.id, message.id]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to send campaign message";
      const retryDelaySeconds = Math.min(recipient.attempt_count, 5) * 60;
      const shouldRetry = recipient.attempt_count < env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES;

      await query(
        `
          update campaign_recipients
          set send_status = 'failed',
              failed_at = timezone('utc', now()),
              next_attempt_at = $4,
              error_message = $5
          where organization_id = $1
            and campaign_id = $2
            and id = $3
        `,
        [
          recipient.organization_id,
          recipient.campaign_id,
          recipient.id,
          shouldRetry ? new Date(Date.now() + retryDelaySeconds * 1000).toISOString() : null,
          errorMessage
        ]
      );

      logger.error({ error, campaignId: recipient.campaign_id, campaignRecipientId: recipient.id }, "Campaign recipient dispatch failed");
    } finally {
      await this.refreshCampaignCompletion(recipient.organization_id, recipient.campaign_id);
    }
  }

  private async sendCampaignRecipientMessage(input: {
    organizationId: string;
    campaignId: string;
    campaignRecipientId: string;
    senderWhatsAppAccountId: string;
    phoneNumber: string;
    profileName?: string | null;
    text: string;
  }) {
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);

    if (!normalizedPhone) {
      throw new Error("Invalid recipient phone number");
    }

    const recipientJid = `${normalizedPhone.replace(/\D/g, "")}@s.whatsapp.net`;
    const conversation = await withTransaction(async (client) => {
      const { contact } = await this.contactService.findOrCreateCanonicalContact(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.senderWhatsAppAccountId,
        whatsappJid: recipientJid,
        phoneRaw: normalizedPhone,
        profileName: input.profileName ?? null,
        profilePushName: null,
        profileAvatarUrl: null
      });

      return this.conversationService.findOrCreateConversation(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.senderWhatsAppAccountId,
        contactId: contact.id
      });
    });

    return this.sendMessageService.send(
      {
        organizationId: input.organizationId,
        whatsappAccountId: input.senderWhatsAppAccountId,
        conversationId: conversation.id,
        text: input.text,
        campaignContext: {
          campaignId: input.campaignId,
          campaignRecipientId: input.campaignRecipientId
        }
      },
      { waitForDispatch: true }
    );
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

function renderCampaignMessage(template: string, recipient: {
  name: string | null;
  phone: string | null;
  gender: string | null;
  salutation: string | null;
  tag: string | null;
  location: string | null;
  product_interest: string | null;
  customer_type: string | null;
  notes: string | null;
}) {
  const salutation =
    recipient.salutation ??
    (recipient.gender === "male" ? "Encik" : recipient.gender === "female" ? "Puan" : "");

  const values: Record<string, string> = {
    name: recipient.name ?? "",
    phone: recipient.phone ?? "",
    gender: recipient.gender ?? "",
    salutation,
    tag: recipient.tag ?? "",
    location: recipient.location ?? "",
    product_interest: recipient.product_interest ?? "",
    customer_type: recipient.customer_type ?? "",
    notes: recipient.notes ?? ""
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export async function closeCampaignDispatchPool() {
  await pool.end();
}
