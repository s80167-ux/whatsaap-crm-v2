import { pool } from "../config/database.js";
import { ContactRepository } from "../repositories/contactRepository.js";
import { ConversationService } from "./conversationService.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import type { AuthUser } from "../types/auth.js";

export class QueryService {
  constructor(
    private readonly contactRepository = new ContactRepository(),
    private readonly conversationService = new ConversationService(),
    private readonly messageRepository = new MessageRepository()
  ) {}

  private getScope(authUser: AuthUser) {
    const assignedOnly =
      authUser.permissionKeys.includes("contacts.read_assigned") ||
      authUser.permissionKeys.includes("conversations.read_assigned");

    return {
      assignedOnly,
      organizationUserId: authUser.organizationUserId
    };
  }

  async listContacts(authUser: AuthUser, organizationId: string) {
    const client = await pool.connect();
    try {
      return await this.contactRepository.list(client, organizationId, this.getScope(authUser));
    } finally {
      client.release();
    }
  }

  async getContact(authUser: AuthUser, organizationId: string, contactId: string) {
    const client = await pool.connect();
    try {
      return await this.contactRepository.findById(client, organizationId, contactId, this.getScope(authUser));
    } finally {
      client.release();
    }
  }

  async listConversations(authUser: AuthUser, organizationId: string) {
    const client = await pool.connect();
    try {
      return await this.conversationService.list(client, organizationId, this.getScope(authUser));
    } finally {
      client.release();
    }
  }

  async listMessages(authUser: AuthUser, organizationId: string, conversationId: string) {
    const client = await pool.connect();
    try {
      return await this.messageRepository.listByConversation(client, organizationId, conversationId, this.getScope(authUser));
    } finally {
      client.release();
    }
  }
}
