import type { PoolClient } from "pg";
import { QuickReplyOutcomeRepository } from "../repositories/quickReplyOutcomeRepository.js";

export class QuickReplyOutcomeService {
  constructor(private readonly repository = new QuickReplyOutcomeRepository()) {}

  async recordTemplateSend(
    client: PoolClient,
    input: {
      organizationId: string;
      quickReplyTemplateId: string;
      messageId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      usedByOrganizationUserId?: string | null;
    }
  ) {
    await this.repository.createForOutboundMessage(client, input);
  }

  async markCustomerReply(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      responseMessageId: string;
      responseAt: Date;
    }
  ) {
    await this.repository.markCustomerReplyForConversation(client, input);
  }

  async markLeadCreated(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      leadId: string;
    }
  ) {
    await this.repository.markLeadCreatedForContact(client, input);
  }

  async markOrderCreated(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      salesOrderId: string;
    }
  ) {
    await this.repository.markOrderCreatedForContact(client, input);
  }

  async markOrderClosed(
    client: PoolClient,
    input: {
      organizationId: string;
      salesOrderId: string;
      outcomeStatus: "order_closed_won" | "order_closed_lost";
    }
  ) {
    await this.repository.markOrderClosed(client, input);
  }
}
