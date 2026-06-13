import { pool, query, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { CampaignSafetyService } from "./campaignSafetyService.js";
import { ContactService } from "./contactService.js";
import { ConversationService } from "./conversationService.js";
import { SendMessageService } from "./sendMessageService.js";
import { renderCampaignTemplateVariables } from "../modules/campaigns/campaignTemplateVariables.js";
import { resolveCampaignTempo, type CampaignSpeedPreset } from "../modules/campaigns/campaignTempo.js";
import { normalizePhoneNumber } from "../utils/phone.js";

type CampaignDispatchCandidate = {
  id: string;
  organization_id: string;
  sender_whatsapp_account_id: string | null;
  sender_mode: "single" | "round_robin";
  message_template: string;
  message_body_type: string;
  attachment: {
    kind: "image" | "video" | "audio" | "document";
    fileName: string;
    mimeType: string;
    dataBase64: string;
    fileSizeBytes: number;
  } | null;
  speed_preset: CampaignSpeedPreset | null;
  delay_per_message_seconds: number | null;
  batch_size: number | null;
  batch_pause_seconds: number | null;
  daily_limit: number | null;
  attach_contact_card: boolean;
  sender_count: string;
  last_queued_at: string | null;
  dispatched_count: string;
  today_count: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
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
  created_at: string;
  attempt_count: number;
  assigned_whatsapp_account_id: string | null;
  sender_assignment_reason: string | null;
  sender_assignment_index: number | null;
  sender_assigned_at: string | null;
  sender_whatsapp_account_id: string | null;
  sender_mode: "single" | "round_robin";
  message_template: string;
  message_body_type: string;
  attachment: {
    kind: "image" | "video" | "audio" | "document";
    fileName: string;
    mimeType: string;
    dataBase64: string;
    fileSizeBytes: number;
  } | null;
  speed_preset: CampaignSpeedPreset | null;
  delay_per_message_seconds: number | null;
  batch_size: number | null;
  batch_pause_seconds: number | null;
  daily_limit: number | null;
  attach_contact_card: boolean;
  min_delay_seconds: number;
  max_delay_seconds: number;
};

type CampaignSenderAccount = {
  whatsapp_account_id: string;
  sort_order: number;
  created_at: string;
  connection_status: string;
  health_score: number | null;
};

type CampaignSenderAssignment = {
  whatsappAccountId: string;
  reason: "single" | "round_robin";
  assignmentIndex: number;
  assignedAt: string;
  availableAt: string | null;
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
            error_message = null,
            failure_code = null,
            failure_reason = null
        where send_status = 'queued'
          and message_id is null
          and queued_at < $1
      `,
      [staleBefore.toISOString()]
    );

    await query(
      `
        update campaign_recipients cr
        set next_attempt_at = null,
            error_message = null
        from campaigns c
        where cr.organization_id = c.organization_id
          and cr.campaign_id = c.id
          and c.status = 'sending'
          and cr.send_status = 'pending'
          and cr.message_id is null
          and cr.error_message = 'Sender account warm-up limit reached for today'
      `
    );
  }

  private async claimNextDueRecipient() {
    const candidates = await query<CampaignDispatchCandidate>(
      `
        select
          c.id,
          c.organization_id,
          c.sender_whatsapp_account_id,
          c.sender_mode,
          c.message_template,
          c.message_body_type,
          c.attachment,
          c.speed_preset,
          c.delay_per_message_seconds,
          c.batch_size,
          c.batch_pause_seconds,
          c.daily_limit,
          c.attach_contact_card,
          coalesce(css.min_delay_seconds, 5) as min_delay_seconds,
          coalesce(css.max_delay_seconds, 20) as max_delay_seconds,
          coalesce(
            (
              select count(*)
              from campaign_sender_accounts csa
              where csa.campaign_id = c.id
                and csa.is_enabled = true
            ),
            case when c.sender_whatsapp_account_id is not null then 1 else 0 end
          )::text as sender_count,
          max(cr.queued_at) filter (where cr.send_status in ('queued', 'sent')) as last_queued_at,
          count(*) filter (where cr.send_status in ('queued', 'sent'))::text as dispatched_count,
          count(*) filter (
            where cr.send_status in ('queued', 'sent')
              and cr.queued_at >= date_trunc('day', timezone('utc', now()))
          )::text as today_count
        from campaigns c
        join campaign_recipients cr on cr.campaign_id = c.id
        left join campaign_safety_settings css on css.organization_id = c.organization_id
        where c.status = 'sending'
          and c.sender_whatsapp_account_id is not null
          and (c.message_template is not null or c.attachment is not null)
          and cr.send_status in ('pending', 'failed')
          and cr.attempt_count < $1
          and coalesce(cr.next_attempt_at, timezone('utc', now())) <= timezone('utc', now())
        group by c.id, css.min_delay_seconds, css.max_delay_seconds
        order by c.updated_at asc, c.created_at asc
        limit 50
      `,
      [env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES]
    );

    const now = Date.now();

    for (const campaign of candidates.rows) {
      const senderCount = Math.max(Number(campaign.sender_count) || 0, 1);
      const todayCount = Number(campaign.today_count);
      const tempo = resolveCampaignTempo({
        speedPreset: campaign.speed_preset,
        delayPerMessageSeconds: campaign.delay_per_message_seconds ?? undefined,
        batchSize: campaign.batch_size ?? undefined,
        batchPauseSeconds: campaign.batch_pause_seconds ?? undefined,
        dailyLimit: campaign.daily_limit ?? undefined
      });

      if (todayCount >= tempo.dailyLimit * senderCount) {
        continue;
      }

      const dispatchedCount = Number(campaign.dispatched_count);
      const effectiveBatchSize = Math.max(tempo.batchSize, 1);
      const isBatchPause = dispatchedCount > 0 && dispatchedCount % effectiveBatchSize === 0;
      const waitSeconds = isBatchPause
        ? tempo.batchPauseSeconds
        : getEffectiveMessageDelaySeconds({
            campaignDelaySeconds: tempo.delayPerMessageSeconds,
            minDelaySeconds: campaign.min_delay_seconds,
            maxDelaySeconds: campaign.max_delay_seconds
          });

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
              and coalesce(cr.validation_status, 'valid') = 'valid'
              and cr.safety_exclusion_reason is null
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
              last_attempt_at = timezone('utc', now()),
              failed_at = null,
              next_attempt_at = null,
              error_message = null,
              failure_code = null,
              failure_reason = null
          from candidate
          join campaigns c on c.id = $1
          left join campaign_safety_settings css on css.organization_id = c.organization_id
          where cr.id = candidate.id
            and c.id = cr.campaign_id
            and c.status = 'sending'
            and c.sender_whatsapp_account_id is not null
            and (c.message_template is not null or c.attachment is not null)
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
            cr.created_at,
            cr.attempt_count,
            cr.assigned_whatsapp_account_id,
            cr.sender_assignment_reason,
            cr.sender_assignment_index,
            cr.sender_assigned_at,
            c.sender_whatsapp_account_id,
            c.sender_mode,
            c.message_template,
            c.message_body_type,
            c.attachment,
            c.speed_preset,
            c.delay_per_message_seconds,
            c.batch_size,
            c.batch_pause_seconds,
            c.daily_limit,
            c.attach_contact_card,
            coalesce(css.min_delay_seconds, 5) as min_delay_seconds,
            coalesce(css.max_delay_seconds, 20) as max_delay_seconds
        `,
        [campaignId, env.CAMPAIGN_DISPATCH_WORKER_MAX_RETRIES]
      );

      return result.rows[0] ?? null;
    });
  }

  private async processRecipient(recipient: ClaimedCampaignRecipient) {
    try {
      const campaignStatus = await this.getCampaignStatus(recipient.organization_id, recipient.campaign_id);

      if (campaignStatus !== "sending") {
        await query(
          `
            update campaign_recipients
            set send_status = case when $4 = 'cancelled' then 'skipped' else 'pending' end,
                queued_at = null,
                next_attempt_at = null,
                error_message = case when $4 = 'cancelled' then 'Campaign cancelled before dispatch' else null end
            where organization_id = $1
              and campaign_id = $2
              and id = $3
              and message_id is null
          `,
          [recipient.organization_id, recipient.campaign_id, recipient.id, campaignStatus]
        );
        return;
      }

      const senderAssignment = await this.resolveSenderAssignment(recipient);

      const message = await this.sendCampaignRecipientMessage({
        organizationId: recipient.organization_id,
        campaignId: recipient.campaign_id,
        campaignRecipientId: recipient.id,
        senderAssignment,
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
        }),
        attachment: recipient.attachment,
        attachContactCard: recipient.attach_contact_card
      });

      await query(
        `
          update campaign_recipients
          set send_status = 'queued',
              message_id = $4,
              assigned_whatsapp_account_id = $5,
              sender_assignment_reason = $6,
              sender_assignment_index = $7,
              sender_assigned_at = $8,
              sent_at = null,
              failed_at = null,
              next_attempt_at = null,
              error_message = null,
              failure_code = null,
              failure_reason = null
          where organization_id = $1
            and campaign_id = $2
            and id = $3
        `,
        [
          recipient.organization_id,
          recipient.campaign_id,
          recipient.id,
          message.id,
          senderAssignment.whatsappAccountId,
          senderAssignment.reason,
          senderAssignment.assignmentIndex,
          senderAssignment.assignedAt
        ]
      );
      await this.touchWarmupStarted(recipient.organization_id, senderAssignment.whatsappAccountId);
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
              error_message = $5,
              failure_code = 'send_failed',
              failure_reason = $5,
              last_attempt_at = timezone('utc', now())
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

      logger.error({ err: error, campaignId: recipient.campaign_id, campaignRecipientId: recipient.id }, "Campaign recipient dispatch failed");
    } finally {
      await CampaignSafetyService.autoPauseCampaignIfNeeded(recipient.organization_id, recipient.campaign_id);
      await this.refreshCampaignCompletion(recipient.organization_id, recipient.campaign_id);
    }
  }

  private async getCampaignStatus(organizationId: string, campaignId: string) {
    const result = await query<{ status: string }>(
      `
        select status
        from campaigns
        where organization_id = $1
          and id = $2
        limit 1
      `,
      [organizationId, campaignId]
    );

    return result.rows[0]?.status ?? null;
  }

  private async touchWarmupStarted(organizationId: string, whatsappAccountId: string) {
    await query(
      `
        update whatsapp_accounts
        set warmup_started_at = coalesce(warmup_started_at, timezone('utc', now())),
            warmup_level = case
              when warmup_started_at is null then 1
              when warmup_started_at >= timezone('utc', now()) - interval '2 days' then 1
              when warmup_started_at >= timezone('utc', now()) - interval '4 days' then 2
              when warmup_started_at >= timezone('utc', now()) - interval '7 days' then 3
              when warmup_started_at >= timezone('utc', now()) - interval '10 days' then 4
              when warmup_started_at >= timezone('utc', now()) - interval '14 days' then 5
              else 6
            end,
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
      `,
      [organizationId, whatsappAccountId]
    );
  }

  private async sendCampaignRecipientMessage(input: {
    organizationId: string;
    campaignId: string;
    campaignRecipientId: string;
    senderAssignment: CampaignSenderAssignment;
    phoneNumber: string;
    profileName?: string | null;
    text: string;
    attachment?: {
      kind: "image" | "video" | "audio" | "document";
      fileName: string;
      mimeType: string;
      dataBase64: string;
      fileSizeBytes: number;
    } | null;
    attachContactCard?: boolean;
  }) {
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);

    if (!normalizedPhone) {
      throw new Error("Invalid recipient phone number");
    }

    const recipientJid = `${normalizedPhone.replace(/\D/g, "")}@s.whatsapp.net`;
    const conversation = await withTransaction(async (client) => {
      const { contact } = await this.contactService.findOrCreateCanonicalContact(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.senderAssignment.whatsappAccountId,
        whatsappJid: recipientJid,
        phoneRaw: normalizedPhone,
        profileName: input.profileName ?? null,
        profilePushName: null,
        profileAvatarUrl: null
      });

      return this.conversationService.findOrCreateConversation(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.senderAssignment.whatsappAccountId,
        contactId: contact.id
      });
    });

    let contactCard = null;
    if (input.attachContactCard) {
      const account = await query<{ display_name: string | null; account_phone_e164: string | null }>(
        `select display_name, account_phone_e164 from whatsapp_accounts where id = $1 and organization_id = $2 limit 1`,
        [input.senderAssignment.whatsappAccountId, input.organizationId]
      );
      const row = account.rows[0];
      if (row?.account_phone_e164) {
        const displayName = row.display_name || row.account_phone_e164;
        contactCard = {
          displayName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;TYPE=CELL:${row.account_phone_e164}\nEND:VCARD`
        };
      }
    }

    return this.sendMessageService.send(
      {
        organizationId: input.organizationId,
        whatsappAccountId: input.senderAssignment.whatsappAccountId,
        conversationId: conversation.id,
        text: input.text,
        attachment: input.attachment ?? null,
        contactCard,
        outboxAvailableAt: env.OUTBOUND_DISPATCH_MODE === "worker_only" ? input.senderAssignment.availableAt : null,
        campaignContext: {
          campaignId: input.campaignId,
          campaignRecipientId: input.campaignRecipientId
        }
      },
      { waitForDispatch: false }
    );
  }

  private async resolveSenderAssignment(recipient: ClaimedCampaignRecipient): Promise<CampaignSenderAssignment> {
    return withTransaction(async (client) => {
      const activeSenders = await this.loadActiveSenders(client, recipient.organization_id, recipient.campaign_id);
      const assignedAt = recipient.sender_assigned_at ?? new Date().toISOString();

      if (recipient.sender_mode === "single") {
        const senderId = recipient.sender_whatsapp_account_id;

        if (!senderId) {
          throw new Error("Campaign sender is not configured");
        }

        if (!activeSenders.some((sender) => sender.whatsapp_account_id === senderId)) {
          throw new Error("Selected campaign sender is not connected");
        }

        const assignmentIndex =
          recipient.sender_assignment_index ?? (await this.getRecipientSequenceIndex(client, recipient.campaign_id, recipient.created_at, recipient.id));

        await this.persistSenderAssignment(client, recipient, {
          whatsappAccountId: senderId,
          reason: "single",
          assignmentIndex,
          assignedAt,
          availableAt: this.computeAvailableAt(recipient, assignmentIndex)
        });

        return {
          whatsappAccountId: senderId,
          reason: "single",
          assignmentIndex,
          assignedAt,
          availableAt: this.computeAvailableAt(recipient, assignmentIndex)
        };
      }

      if (recipient.assigned_whatsapp_account_id) {
        const stillActive = activeSenders.some((sender) => sender.whatsapp_account_id === recipient.assigned_whatsapp_account_id);

        if (stillActive && recipient.sender_assignment_index !== null) {
          return {
            whatsappAccountId: recipient.assigned_whatsapp_account_id,
            reason: "round_robin",
            assignmentIndex: recipient.sender_assignment_index,
            assignedAt,
            availableAt: this.computeAvailableAt(recipient, recipient.sender_assignment_index)
          };
        }
      }

      if (activeSenders.length === 0) {
        throw new Error("No connected sender is available for this campaign");
      }

      const sequenceIndex = await this.getRecipientSequenceIndex(client, recipient.campaign_id, recipient.created_at, recipient.id);
      const senderPosition = sequenceIndex % activeSenders.length;
      const assignmentIndex = Math.floor(sequenceIndex / activeSenders.length);
      const sender = activeSenders[senderPosition];

      const assignment = {
        whatsappAccountId: sender.whatsapp_account_id,
        reason: "round_robin" as const,
        assignmentIndex,
        assignedAt,
        availableAt: this.computeAvailableAt(recipient, assignmentIndex)
      };

      await this.persistSenderAssignment(client, recipient, assignment);
      return assignment;
    });
  }

  private async loadActiveSenders(client: Parameters<typeof withTransaction>[0] extends (client: infer T) => Promise<unknown> ? T : never, organizationId: string, campaignId: string) {
    const result = await client.query<CampaignSenderAccount>(
      `
        select
          csa.whatsapp_account_id,
          csa.sort_order,
          csa.created_at,
          lower(coalesce(wa.connection_status, 'disconnected')) as connection_status,
          wa.health_score
        from campaign_sender_accounts csa
        join whatsapp_accounts wa on wa.id = csa.whatsapp_account_id
        where csa.organization_id = $1
          and csa.campaign_id = $2
          and csa.is_enabled = true
        order by csa.sort_order asc, csa.created_at asc, csa.id asc
      `,
      [organizationId, campaignId]
    );

    const eligible = result.rows.filter((sender) =>
      ["connected", "open", "ready"].includes(sender.connection_status) &&
      !["banned", "logged_out", "suspected_ban", "reconnect_suppressed"].includes(sender.connection_status)
    );

    // Sort by health_score desc so round-robin starts from healthiest accounts
    eligible.sort((a, b) => (b.health_score ?? 50) - (a.health_score ?? 50));

    // If there are healthy accounts (score >= 20), exclude very unhealthy ones
    const healthy = eligible.filter((s) => (s.health_score ?? 50) >= 20);
    return healthy.length > 0 ? healthy : eligible;
  }

  private async getRecipientSequenceIndex(
    client: Parameters<typeof withTransaction>[0] extends (client: infer T) => Promise<unknown> ? T : never,
    campaignId: string,
    createdAt: string,
    recipientId: string
  ) {
    const result = await client.query<{ sequence_index: string }>(
      `
        select greatest(count(*) - 1, 0)::text as sequence_index
        from campaign_recipients
        where campaign_id = $1
          and (
            created_at < $2
            or (created_at = $2 and id <= $3)
          )
      `,
      [campaignId, createdAt, recipientId]
    );

    return Number(result.rows[0]?.sequence_index ?? 0);
  }

  private async persistSenderAssignment(
    client: Parameters<typeof withTransaction>[0] extends (client: infer T) => Promise<unknown> ? T : never,
    recipient: ClaimedCampaignRecipient,
    assignment: CampaignSenderAssignment
  ) {
    await client.query(
      `
        update campaign_recipients
        set assigned_whatsapp_account_id = $4,
            sender_assignment_reason = $5,
            sender_assignment_index = $6,
            sender_assigned_at = $7
        where organization_id = $1
          and campaign_id = $2
          and id = $3
      `,
      [
        recipient.organization_id,
        recipient.campaign_id,
        recipient.id,
        assignment.whatsappAccountId,
        assignment.reason,
        assignment.assignmentIndex,
        assignment.assignedAt
      ]
    );
  }

  private computeAvailableAt(recipient: ClaimedCampaignRecipient, assignmentIndex: number) {
    const tempo = resolveCampaignTempo({
      speedPreset: recipient.speed_preset,
      delayPerMessageSeconds: recipient.delay_per_message_seconds ?? undefined,
      batchSize: recipient.batch_size ?? undefined,
      batchPauseSeconds: recipient.batch_pause_seconds ?? undefined,
      dailyLimit: recipient.daily_limit ?? undefined
    });
    const dailyLimit = Math.max(tempo.dailyLimit, 1);
    const indexWithinDay = assignmentIndex % dailyLimit;
    const dayOffset = Math.floor(assignmentIndex / dailyLimit);
    const pauseBlocks = Math.floor(indexWithinDay / Math.max(tempo.batchSize, 1));
    const messageDelaySeconds = getEffectiveMessageDelaySeconds({
      campaignDelaySeconds: tempo.delayPerMessageSeconds,
      minDelaySeconds: recipient.min_delay_seconds,
      maxDelaySeconds: recipient.max_delay_seconds
    });
    const secondsOffset = indexWithinDay * messageDelaySeconds + pauseBlocks * tempo.batchPauseSeconds;
    const availableAt = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000 + secondsOffset * 1000);
    return availableAt.toISOString();
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
  const withVariables = renderCampaignTemplateVariables(template, {
    name: recipient.name,
    phone: recipient.phone,
    gender: recipient.gender,
    salutation: recipient.salutation,
    tag: recipient.tag,
    location: recipient.location,
    product_interest: recipient.product_interest,
    customer_type: recipient.customer_type,
    notes: recipient.notes
  });
  return renderSpintax(withVariables);
}

/**
 * Parse and expand spin syntax: {option1|option2|option3}
 * Supports nested groups and escaped braces: \{ and \}
 */
export function renderSpintax(text: string): string {
  // Replace escaped braces with temporary placeholders so they don't interfere
  const ESCAPED_OPEN = "\x00SPIN_OPEN\x00";
  const ESCAPED_CLOSE = "\x00SPIN_CLOSE\x00";
  let protectedText = text.replace(/\\\{/g, ESCAPED_OPEN).replace(/\\\}/g, ESCAPED_CLOSE);

  // Find the first unescaped { that is NOT part of {{ (shouldn't exist after variable substitution,
  // but we guard against it anyway by checking it's not preceded by another {)
  function expand(input: string): string {
    let result = "";
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (ch === "{" && input[i + 1] !== "{") {
        // Find matching } at nesting level 0
        let depth = 1;
        let j = i + 1;
        while (j < input.length && depth > 0) {
          if (input[j] === "{" && input[j + 1] !== "{") depth++;
          else if (input[j] === "}") depth--;
          j++;
        }
        if (depth !== 0) {
          // Unmatched brace — leave as-is to avoid data loss
          result += ch;
          i++;
          continue;
        }
        const groupContent = input.slice(i + 1, j - 1);
        // Split by | at nesting level 0
        const options: string[] = [];
        let optStart = 0;
        let splitDepth = 0;
        for (let k = 0; k < groupContent.length; k++) {
          const c = groupContent[k];
          if (c === "{" && groupContent[k + 1] !== "{") splitDepth++;
          else if (c === "}") splitDepth--;
          else if (c === "|" && splitDepth === 0) {
            options.push(groupContent.slice(optStart, k));
            optStart = k + 1;
          }
        }
        options.push(groupContent.slice(optStart));
        // Filter out empty options that resulted from stray pipes
        const validOptions = options.filter((o) => o.length > 0);
        if (validOptions.length === 0) {
          result += ch;
          i++;
          continue;
        }
        const chosen = validOptions[Math.floor(Math.random() * validOptions.length)];
        result += expand(chosen);
        i = j;
      } else {
        result += ch;
        i++;
      }
    }
    return result;
  }

  const expanded = expand(protectedText);
  return expanded.replace(new RegExp(ESCAPED_OPEN, "g"), "{").replace(new RegExp(ESCAPED_CLOSE, "g"), "}");
}

function getEffectiveMessageDelaySeconds(input: {
  campaignDelaySeconds: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}) {
  const orgSafetyDelaySeconds = Math.max(input.minDelaySeconds || 0, input.maxDelaySeconds || 0, 1);
  return Math.max(input.campaignDelaySeconds, orgSafetyDelaySeconds);
}

export async function closeCampaignDispatchPool() {
  await pool.end();
}
