import { withTransaction } from "../config/database.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import type { InboundMessageInput } from "../types/domain.js";
import { normalizeMessageType } from "../utils/message.js";
import { ContactService } from "./contactService.js";
import { ConversationService } from "./conversationService.js";
import { ProjectionService } from "./projectionService.js";

export class MessageIngestionService {
  constructor(
    private readonly contactService = new ContactService(),
    private readonly conversationService = new ConversationService(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly messageRepository = new MessageRepository(),
    private readonly projectionService = new ProjectionService()
  ) {}

  async ingest(input: InboundMessageInput) {
    return withTransaction(async (client) => {
      const { contact, identity } = await this.contactService.findOrCreateCanonicalContact(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        whatsappJid: input.remoteJid,
        phoneRaw: input.phoneRaw,
        profileName: input.profileName
      });

      const conversation = await this.conversationService.findOrCreateConversation(client, {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        contactId: contact.id
      });

      const { message, inserted } = await this.messageRepository.insertIfAbsent(client, {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        whatsappAccountId: input.whatsappAccountId,
        externalMessageId: input.externalMessageId,
        externalChatId: input.remoteJid,
        direction: input.direction,
        messageType: normalizeMessageType(input.messageType),
        contentText: input.textBody,
        rawPayload: input.rawPayload,
        sentAt: input.sentAt
      });

      if (inserted) {
        await this.conversationRepository.bumpLastMessage(client, {
          conversationId: conversation.id,
          direction: input.direction,
          sentAt: input.sentAt,
          incrementUnread: input.direction === "incoming"
        });
      }

      await this.projectionService.refreshForMessage(client, {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        sentAt: input.sentAt
      });

      return { contact, identity, conversation, message, inserted };
    });
  }
}
