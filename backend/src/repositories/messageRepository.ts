import type { PoolClient } from "pg";
import type { MessageRecord } from "../types/domain.js";

export class MessageRepository {
  async insertIfAbsent(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      contactIdentityId: string | null;
      externalMessageId: string;
      direction: "inbound" | "outbound";
      messageType: string;
      contentText: string | null;
      rawPayload: unknown;
      sentAt: Date;
    }
  ): Promise<{ message: MessageRecord; inserted: boolean }> {
    const result = await client.query<MessageRecord & { inserted: boolean }>(
      `
        with inserted as (
          insert into messages (
            organization_id,
            conversation_id,
            contact_id,
            whatsapp_account_id,
            contact_identity_id,
            external_message_id,
            direction,
            message_type,
            content_text,
            raw_payload,
            sent_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, nullif($9, ''), $10, $11)
          on conflict (organization_id, whatsapp_account_id, external_message_id)
          do nothing
          returning *, true as inserted
        )
        select * from inserted
        union all
        select m.*, false as inserted
        from messages m
        where m.organization_id = $1
          and m.whatsapp_account_id = $4
          and m.external_message_id = $6
          and not exists (select 1 from inserted)
        limit 1
      `,
      [
        input.organizationId,
        input.conversationId,
        input.contactId,
        input.whatsappAccountId,
        input.contactIdentityId,
        input.externalMessageId,
        input.direction,
        input.messageType,
        input.contentText,
        input.rawPayload ?? null,
        input.sentAt.toISOString()
      ]
    );

    const { inserted, ...message } = result.rows[0];
    return { message, inserted };
  }

  async listByConversation(
    client: PoolClient,
    organizationId: string,
    conversationId: string
  ): Promise<MessageRecord[]> {
    const result = await client.query<MessageRecord>(
      `
        select id, organization_id, conversation_id, contact_id, whatsapp_account_id,
               contact_identity_id, external_message_id, direction, message_type,
               content_text, raw_payload, sent_at
        from messages
        where organization_id = $1
          and conversation_id = $2
          and deleted_at is null
        order by sent_at asc, id asc
      `,
      [organizationId, conversationId]
    );

    return result.rows;
  }
}
