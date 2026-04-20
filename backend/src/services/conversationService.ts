import type { PoolClient } from "pg";
import { ConversationRepository } from "../repositories/conversationRepository.js";

export class ConversationService {
  constructor(private readonly repository = new ConversationRepository()) {}

  async findOrCreateConversation(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      contactId: string;
    }
  ) {
    return this.repository.findOrCreate(client, input);
  }

  async list(client: PoolClient, organizationId: string) {
    return this.repository.list(client, organizationId);
  }
}
