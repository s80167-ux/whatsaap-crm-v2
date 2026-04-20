import { pool } from "../config/database.js";
import { ContactRepository } from "../repositories/contactRepository.js";
import { ConversationService } from "./conversationService.js";
import { MessageRepository } from "../repositories/messageRepository.js";

export class QueryService {
  constructor(
    private readonly contactRepository = new ContactRepository(),
    private readonly conversationService = new ConversationService(),
    private readonly messageRepository = new MessageRepository()
  ) {}

  async listContacts(organizationId: string) {
    const client = await pool.connect();
    try {
      return await this.contactRepository.list(client, organizationId);
    } finally {
      client.release();
    }
  }

  async listConversations(organizationId: string) {
    const client = await pool.connect();
    try {
      return await this.conversationService.list(client, organizationId);
    } finally {
      client.release();
    }
  }

  async listMessages(organizationId: string, conversationId: string) {
    const client = await pool.connect();
    try {
      return await this.messageRepository.listByConversation(client, organizationId, conversationId);
    } finally {
      client.release();
    }
  }
}
