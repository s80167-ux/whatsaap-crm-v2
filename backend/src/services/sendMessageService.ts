import { withTransaction } from "../config/database.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import type { SendMessageInput } from "../types/domain.js";
import { ConnectorClient } from "./connectorClient.js";
import { ProjectionService } from "./projectionService.js";

export class SendMessageService {
  constructor(
    private readonly connectorClient = new ConnectorClient(),
    private readonly messageRepository = new MessageRepository(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly projectionService = new ProjectionService()
  ) {}

  async send(input: SendMessageInput) {
    const conversation = await withTransaction(async (client) => {
      const conversationResult = await client.query<{ contact_id: string; contact_jid: string }>(
        `
          select c.contact_id, ci.wa_jid as contact_jid
          from conversations c
          join contact_identities ci on ci.contact_id = c.contact_id and ci.whatsapp_account_id = c.whatsapp_account_id
          where c.id = $1
            and c.organization_id = $2
            and c.whatsapp_account_id = $3
          limit 1
        `,
        [input.conversationId, input.organizationId, input.whatsappAccountId]
      );

      const conversationRow = conversationResult.rows[0];
      const recipientJid = conversationRow?.contact_jid;

      if (!recipientJid) {
        throw new Error("Recipient identity not found for conversation");
      }

      const outbound = await this.connectorClient.sendMessage({
        accountId: input.whatsappAccountId,
        recipientJid,
        text: input.text
      });
      const sentAt = new Date();
      const outboundMessageId =
        typeof outbound === "object" && outbound && "key" in outbound
          ? ((outbound as { key?: { id?: string } }).key?.id ?? crypto.randomUUID())
          : crypto.randomUUID();

      const stored = await this.messageRepository.insertIfAbsent(client, {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        contactId: conversationRow.contact_id,
        whatsappAccountId: input.whatsappAccountId,
        externalMessageId: outboundMessageId,
        externalChatId: recipientJid,
        direction: "outgoing",
        messageType: "text",
        contentText: input.text,
        rawPayload: outbound ?? null,
        sentAt,
        ackStatus: "server_ack"
      });

      if (stored.inserted) {
        await this.messageRepository.appendStatusEvent(client, {
          messageId: stored.message.id,
          status: "server_ack",
          payload: outbound ?? null
        });

        await this.messageRepository.updateAckStatus(client, {
          messageId: stored.message.id,
          ackStatus: "server_ack",
          deliveredAt: sentAt
        });

        await this.conversationRepository.bumpLastMessage(client, {
          conversationId: input.conversationId,
          direction: "outgoing",
          sentAt,
          incrementUnread: false
        });
      }

      await this.projectionService.refreshForMessage(client, {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        contactId: conversationRow.contact_id,
        sentAt
      });

      return stored.message;
    });

    return conversation;
  }
}
