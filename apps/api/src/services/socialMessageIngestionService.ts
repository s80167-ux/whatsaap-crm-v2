import type { PoolClient } from "pg";
import { withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { emitMobileInboxUpdate } from "../modules/mobile/mobileInboxEvents.bus.js";
import { NotificationsService } from "../modules/notifications/notifications.service.js";
import { ContactRepository } from "../repositories/contactRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { ProjectionService } from "./projectionService.js";

type SocialSource = "facebook" | "instagram";
type SocialDirection = "incoming" | "outgoing";

type SocialRawEventRecord = {
  id: string;
  organization_id: string;
  social_channel_account_id: string;
  source: SocialSource;
  event_type: string;
  external_event_id: string | null;
  event_timestamp: string | null;
  received_at: string;
  payload: unknown;
  account_external_id: string | null;
};

type NormalizedSocialMessage = {
  source: SocialSource;
  socialChannelAccountId: string;
  accountExternalId: string;
  externalProfileId: string;
  externalMessageId: string;
  externalThreadKey: string;
  direction: SocialDirection;
  messageType: string;
  text: string | null;
  sentAt: Date;
  payload: unknown;
};

type ProcessResult = {
  processed: number;
  ignored: number;
  failed: number;
};

export class SocialMessageIngestionService {
  constructor(
    private readonly contactRepository = new ContactRepository(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly projectionService = new ProjectionService(),
    private readonly notificationsService = new NotificationsService()
  ) {}

  async processPendingBatch(limit = 25): Promise<ProcessResult> {
    const events = await this.claimPendingEvents(limit);
    const result: ProcessResult = {
      processed: 0,
      ignored: 0,
      failed: 0
    };

    for (const event of events) {
      try {
        const status = await this.processOne(event);
        result[status] += 1;
      } catch (error) {
        result.failed += 1;
        logger.error({ err: error, socialRawEventId: event.id }, "Failed to process social raw event");
      }
    }

    return result;
  }

  private async claimPendingEvents(limit: number) {
    return withTransaction(async (client) => {
      const result = await client.query<SocialRawEventRecord>(
        `
          with claimed as (
            select sre.id
            from social_raw_events sre
            where sre.processing_status = 'pending'
            order by sre.received_at asc, sre.id asc
            limit $1
            for update skip locked
          )
          update social_raw_events sre
          set processing_status = 'processing'
          from claimed
          where sre.id = claimed.id
          returning
            sre.id,
            sre.organization_id,
            sre.social_channel_account_id,
            sre.source,
            sre.event_type,
            sre.external_event_id,
            sre.event_timestamp,
            sre.received_at,
            sre.payload,
            (
              select sca.external_account_id
              from social_channel_accounts sca
              where sca.id = sre.social_channel_account_id
            ) as account_external_id
        `,
        [Math.max(1, Math.min(limit, 100))]
      );

      return result.rows;
    });
  }

  private async processOne(event: SocialRawEventRecord): Promise<keyof ProcessResult> {
    const normalized = this.normalizeEvent(event);

    if (!normalized) {
      await this.markIgnored(event.id, "Unsupported or incomplete social event");
      return "ignored";
    }

    const eventKey = `${normalized.source}:${normalized.socialChannelAccountId}:${normalized.externalMessageId}`;
    try {
      const inboxUpdate = await withTransaction(async (client) => {
        const insertedKey = await this.insertProcessedKey(client, event.organization_id, normalized.source, eventKey);

        if (!insertedKey) {
          await this.markEvent(client, event.id, "ignored", "Duplicate social event");
          return null;
        }

        const contact = await this.findOrCreateSocialContact(client, event.organization_id, normalized);
        const conversation = await this.findOrCreateSocialConversation(client, event.organization_id, contact.id, normalized);
        const insertedMessage = await this.insertSocialMessageIfAbsent(client, event.organization_id, contact.id, conversation.id, normalized);
        let update:
          | {
              organizationId: string;
              conversationId: string;
            }
          | null = null;

        if (insertedMessage) {
          update = {
            organizationId: event.organization_id,
            conversationId: conversation.id
          };

          await this.conversationRepository.bumpLastMessage(client, {
            conversationId: conversation.id,
            direction: normalized.direction,
            sentAt: normalized.sentAt,
            incrementUnread: normalized.direction === "incoming"
          });

          await this.projectionService.refreshForMessage(client, {
            organizationId: event.organization_id,
            conversationId: conversation.id,
            contactId: contact.id,
            sentAt: normalized.sentAt
          });

          if (normalized.direction === "incoming") {
            await this.createInboundNotification(client, event.organization_id, contact, conversation.id, normalized);
          }
        }

        await this.markEvent(client, event.id, "processed", null);
        return update;
      });

      if (inboxUpdate) {
        emitMobileInboxUpdate({
          type: "message_created",
          organizationId: inboxUpdate.organizationId,
          conversationId: inboxUpdate.conversationId
        });
      }

      return "processed";
    } catch (error) {
      await this.markFailed(event.id, error instanceof Error ? error.message : "Social event processing failed");
      throw error;
    }
  }

  private normalizeEvent(event: SocialRawEventRecord): NormalizedSocialMessage | null {
    const payload = asRecord(event.payload);
    const sender = asRecord(payload?.sender);
    const recipient = asRecord(payload?.recipient);
    const message = asRecord(payload?.message);
    const postback = asRecord(payload?.postback);
    const senderId = getString(sender?.id);
    const recipientId = getString(recipient?.id);
    const accountExternalId = event.account_external_id;

    if (event.event_type !== "messaging" || !senderId || !recipientId || !accountExternalId) {
      return null;
    }

    const direction: SocialDirection = senderId === accountExternalId ? "outgoing" : "incoming";
    const externalProfileId = direction === "incoming" ? senderId : recipientId;
    const externalMessageId =
      event.external_event_id ?? getString(message?.mid) ?? `social-raw-event:${event.id}`;
    const text = getString(message?.text) ?? getString(postback?.title) ?? getString(postback?.payload);
    const attachmentType = getFirstAttachmentType(message);
    const messageType = normalizeSocialMessageType(attachmentType ?? (text ? "text" : null));
    const timestamp = event.event_timestamp ?? getTimestamp(payload?.timestamp) ?? event.received_at;

    if (!messageType) {
      return null;
    }

    return {
      source: event.source,
      socialChannelAccountId: event.social_channel_account_id,
      accountExternalId,
      externalProfileId,
      externalMessageId,
      externalThreadKey: `profile:${externalProfileId}`,
      direction,
      messageType,
      text,
      sentAt: new Date(timestamp),
      payload: event.payload
    };
  }

  private async findOrCreateSocialContact(
    client: PoolClient,
    organizationId: string,
    input: NormalizedSocialMessage
  ) {
    const existingIdentity = await client.query<{ contact_id: string }>(
      `
        select contact_id
        from contact_identities
        where organization_id = $1
          and channel = $2
          and social_channel_account_id = $3
          and external_profile_id = $4
          and coalesce(is_active, true)
          and deleted_at is null
        limit 1
      `,
      [organizationId, input.source, input.socialChannelAccountId, input.externalProfileId]
    );

    const existingContactId = existingIdentity.rows[0]?.contact_id;
    const displayName = `${toTitle(input.source)} user ${input.externalProfileId.slice(-6)}`;

    const contact = existingContactId
      ? await this.contactRepository.findById(client, organizationId, existingContactId)
      : await this.contactRepository.create(client, {
          organizationId,
          displayName,
          primaryPhoneE164: null,
          primaryPhoneNormalized: null,
          identityStatus: "provisional"
        });

    if (!contact) {
      throw new Error("Unable to resolve social contact");
    }

    await client.query(
      `
        insert into contact_identities (
          organization_id,
          channel,
          contact_id,
          social_channel_account_id,
          external_profile_id,
          external_identity,
          profile_name,
          identity_quality,
          identity_score,
          first_seen_at,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $5, $6, 'strong', 70, timezone('utc', now()), timezone('utc', now()))
        on conflict (organization_id, channel, social_channel_account_id, external_profile_id)
        where channel in ('facebook', 'instagram')
          and social_channel_account_id is not null
          and external_profile_id is not null
        do update set
          contact_id = excluded.contact_id,
          profile_name = coalesce(nullif(trim(contact_identities.profile_name), ''), excluded.profile_name),
          last_seen_at = timezone('utc', now()),
          is_active = true
      `,
      [organizationId, input.source, contact.id, input.socialChannelAccountId, input.externalProfileId, displayName]
    );

    return contact;
  }

  private async findOrCreateSocialConversation(
    client: PoolClient,
    organizationId: string,
    contactId: string,
    input: NormalizedSocialMessage
  ) {
    const result = await client.query<{
      id: string;
      assigned_user_id: string | null;
    }>(
      `
        insert into conversations (
          organization_id,
          channel,
          whatsapp_account_id,
          social_channel_account_id,
          contact_id,
          external_thread_key,
          thread_type,
          status,
          first_message_at
        )
        values ($1, $2, null, $3, $4, $5, 'direct', 'open', $6)
        on conflict (organization_id, channel, social_channel_account_id, external_thread_key)
        where channel in ('facebook', 'instagram')
          and social_channel_account_id is not null
          and external_thread_key is not null
        do update set
          contact_id = excluded.contact_id,
          updated_at = timezone('utc', now())
        returning id, assigned_user_id
      `,
      [
        organizationId,
        input.source,
        input.socialChannelAccountId,
        contactId,
        input.externalThreadKey,
        input.sentAt.toISOString()
      ]
    );

    return result.rows[0];
  }

  private async insertSocialMessageIfAbsent(
    client: PoolClient,
    organizationId: string,
    contactId: string,
    conversationId: string,
    input: NormalizedSocialMessage
  ) {
    const result = await client.query<{ id: string }>(
      `
        insert into messages (
          organization_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          social_channel_account_id,
          external_message_id,
          external_chat_id,
          channel,
          direction,
          message_type,
          content_text,
          content_json,
          ack_status,
          sent_at
        )
        values ($1, $2, $3, null, $4, $5, $6, $7, $8, $9, nullif($10, ''), $11::jsonb, 'server_ack', $12)
        on conflict (organization_id, channel, social_channel_account_id, external_message_id)
        where channel in ('facebook', 'instagram')
          and social_channel_account_id is not null
          and external_message_id is not null
        do nothing
        returning id
      `,
      [
        organizationId,
        conversationId,
        contactId,
        input.socialChannelAccountId,
        input.externalMessageId,
        input.externalThreadKey,
        input.source,
        input.direction,
        input.messageType,
        input.text,
        JSON.stringify({ rawPayload: input.payload }),
        input.sentAt.toISOString()
      ]
    );

    return Boolean(result.rows[0]);
  }

  private async insertProcessedKey(client: PoolClient, organizationId: string, source: SocialSource, eventKey: string) {
    const result = await client.query<{ id: string }>(
      `
        insert into social_processed_event_keys (organization_id, source, event_key)
        values ($1, $2, $3)
        on conflict (event_key) do nothing
        returning id
      `,
      [organizationId, source, eventKey]
    );

    return Boolean(result.rows[0]);
  }

  private async createInboundNotification(
    client: PoolClient,
    organizationId: string,
    contact: { id: string; display_name: string | null; primary_phone_normalized: string | null; primary_phone_e164: string | null },
    conversationId: string,
    input: NormalizedSocialMessage
  ) {
    const contactLabel = contact.display_name ?? contact.primary_phone_normalized ?? contact.primary_phone_e164 ?? `${toTitle(input.source)} contact`;

    await this.notificationsService.createOrUpdate(client, {
      organizationId,
      type: "inbound_social_message",
      title: `New ${toTitle(input.source)} message from ${contactLabel}`,
      message: input.text?.slice(0, 160) ?? `New ${input.messageType} message`,
      targetPath: `/inbox?organization_id=${encodeURIComponent(organizationId)}&conversationId=${encodeURIComponent(conversationId)}`,
      targetEntityType: "conversation",
      targetEntityId: conversationId,
      uniqueKey: `inbound_social_message:conversation:${conversationId}`,
      metadata: {
        channel: input.source,
        contactId: contact.id,
        externalProfileId: input.externalProfileId,
        messageCount: 1
      }
    });
  }

  private async markIgnored(eventId: string, reason: string) {
    await withTransaction((client) => this.markEvent(client, eventId, "ignored", reason));
  }

  private async markFailed(eventId: string, reason: string) {
    await withTransaction((client) => this.markEvent(client, eventId, "failed", reason));
  }

  private async markEvent(
    client: PoolClient,
    eventId: string,
    status: "processed" | "ignored" | "failed",
    errorMessage: string | null
  ) {
    await client.query(
      `
        update social_raw_events
        set processing_status = $2,
            error_message = $3,
            retry_count = case when $2 = 'failed' then retry_count + 1 else retry_count end
        where id = $1
      `,
      [eventId, status, errorMessage]
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getTimestamp(value: unknown) {
  const numericValue = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numericValue) ? new Date(numericValue).toISOString() : null;
}

function getFirstAttachmentType(message: Record<string, unknown> | null) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const firstAttachment = asRecord(attachments[0]);
  return getString(firstAttachment?.type);
}

function normalizeSocialMessageType(value: string | null) {
  switch (value) {
    case "text":
      return "text";
    case "image":
    case "video":
    case "audio":
      return value;
    case "file":
      return "document";
    default:
      return value ? "text" : null;
  }
}

function toTitle(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
