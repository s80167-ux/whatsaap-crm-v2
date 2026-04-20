import { withTransaction } from "../config/database.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import type { SendMessageInput } from "../types/domain.js";
import { WhatsAppSessionManager } from "../whatsapp/sessionManager.js";

export class SendMessageService {
  constructor(
    private readonly sessionManager = WhatsAppSessionManager.getInstance(),
    private readonly messageRepository = new MessageRepository(),
    private readonly conversationRepository = new ConversationRepository()
  ) {}

  async send(input: SendMessageInput) {
    const session = this.sessionManager.getSocket(input.whatsappAccountId);

    if (!session) {
      throw new Error("WhatsApp session is not connected");
    }

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

      const outbound = await session.sendMessage(recipientJid, { text: input.text });
      const sentAt = new Date();
      const outboundMessageId = outbound?.key?.id ?? crypto.randomUUID();

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
        sentAt
      });

      if (stored.inserted) {
        await this.conversationRepository.bumpLastMessage(client, {
          conversationId: input.conversationId,
          direction: "outgoing",
          sentAt,
          incrementUnread: false
        });
      }

      return stored.message;
    });

    return conversation;
  }
}
