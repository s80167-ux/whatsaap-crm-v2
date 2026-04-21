import type { PoolClient } from "pg";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { OrganizationUserRepository } from "../repositories/organizationUserRepository.js";
import { ProjectionService } from "./projectionService.js";

export class ConversationService {
  constructor(
    private readonly repository = new ConversationRepository(),
    private readonly organizationUserRepository = new OrganizationUserRepository(),
    private readonly projectionService = new ProjectionService()
  ) {}

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

  async list(
    client: PoolClient,
    organizationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ) {
    return this.repository.list(client, organizationId, options);
  }

  async assign(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      organizationUserId: string;
    }
  ) {
    const organizationUser = await this.organizationUserRepository.findById(client, input.organizationUserId);

    if (!organizationUser || organizationUser.organization_id !== input.organizationId || organizationUser.status !== "active") {
      throw new Error("Organization user not found");
    }

    const assignedConversation = await this.repository.assign(client, input);

    if (!assignedConversation) {
      throw new Error("Conversation not found");
    }

    await this.projectionService.refreshConversation(client, assignedConversation.id);

    return assignedConversation;
  }
}
