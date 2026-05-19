import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import { withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { decryptSocialToken } from "../lib/socialTokenCrypto.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { ProjectionService } from "./projectionService.js";

type SocialConversationRecord = {
  id: string;
  organization_id: string;
  channel: "facebook" | "instagram";
  contact_id: string;
  social_channel_account_id: string | null;
  external_thread_key: string | null;
  access_token_encrypted: string | null;
};

type MetaSendResponse = {
  recipient_id?: string;
  message_id?: string;
  error?: {
    message?: string;
    code?: number;
    type?: string;
  };
};

export class SocialMessageSendService {
  constructor(
    private readonly conversationRepository = new ConversationRepository(),
    private readonly projectionService = new ProjectionService()
  ) {}

  async send(input: {
    organizationId: string;
    conversationId: string;
    text: string;
  }) {
    const conversation = await withTransaction((client) =>
      this.findSocialConversation(client, input.organizationId, input.conversationId)
    );

    if (!conversation) {
      throw new AppError("Social conversation not found", 404, "conversation_not_found");
    }

    if (!conversation.social_channel_account_id) {
      throw new AppError("Social channel account is missing for this conversation", 400, "social_channel_account_missing");
    }

    if (!conversation.access_token_encrypted) {
      throw new AppError("Facebook Page access token is not stored. Reconnect the social channel.", 400, "social_token_missing");
    }

    const externalProfileId = this.extractExternalProfileId(conversation.external_thread_key);
    const pageAccessToken = decryptSocialToken(conversation.access_token_encrypted);
    const metaResponse = await this.sendToMeta(pageAccessToken, externalProfileId, input.text);
    const externalMessageId = metaResponse.message_id ?? `social-send:${crypto.randomUUID()}`;
    const sentAt = new Date();

    return withTransaction(async (client) => {
      await client.query(
        `
          update social_channel_accounts
          set token_last_verified_at = timezone('utc', now()),
              token_error_message = null
          where id = $1
        `,
        [conversation.social_channel_account_id]
      );

      const result = await client.query(
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
          values ($1, $2, $3, null, $4, $5, $6, $7, 'outgoing', 'text', $8, $9::jsonb, 'server_ack', $10)
          returning
            id,
            organization_id,
            conversation_id,
            contact_id,
            whatsapp_account_id,
            social_channel_account_id,
            channel,
            external_message_id,
            external_chat_id,
            reply_to_message_id,
            is_deleted,
            direction,
            message_type,
            content_text,
            content_json,
            sent_at,
            delivered_at,
            read_at,
            ack_status
        `,
        [
          conversation.organization_id,
          conversation.id,
          conversation.contact_id,
          conversation.social_channel_account_id,
          externalMessageId,
          conversation.external_thread_key,
          conversation.channel,
          input.text,
          JSON.stringify({ metaSendResponse: metaResponse }),
          sentAt.toISOString()
        ]
      );

      const message = result.rows[0];

      await this.conversationRepository.bumpLastMessage(client, {
        conversationId: conversation.id,
        direction: "outgoing",
        sentAt,
        incrementUnread: false
      });

      await this.projectionService.refreshForMessage(client, {
        organizationId: conversation.organization_id,
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        sentAt
      });

      return message;
    });
  }

  private async findSocialConversation(client: PoolClient, organizationId: string, conversationId: string) {
    const result = await client.query<SocialConversationRecord>(
      `
        select
          c.id,
          c.organization_id,
          c.channel,
          c.contact_id,
          c.social_channel_account_id,
          c.external_thread_key,
          sca.access_token_encrypted
        from conversations c
        join social_channel_accounts sca on sca.id = c.social_channel_account_id
        where c.id = $1
          and c.organization_id = $2
          and c.channel in ('facebook', 'instagram')
        limit 1
      `,
      [conversationId, organizationId]
    );

    return result.rows[0] ?? null;
  }

  private extractExternalProfileId(externalThreadKey: string | null) {
    const prefix = "profile:";

    if (!externalThreadKey?.startsWith(prefix) || externalThreadKey.length <= prefix.length) {
      throw new AppError("Social recipient profile id is missing for this conversation", 400, "social_profile_missing");
    }

    return externalThreadKey.slice(prefix.length);
  }

  private async sendToMeta(pageAccessToken: string, externalProfileId: string, text: string) {
    const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/me/messages`);
    url.searchParams.set("access_token", pageAccessToken);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: { id: externalProfileId },
        messaging_type: "RESPONSE",
        message: { text }
      })
    });
    const body = await response.json() as MetaSendResponse;

    if (!response.ok) {
      throw new AppError(body.error?.message ?? "Unable to send Facebook Messenger reply", 502, "social_send_failed");
    }

    return body;
  }
}
