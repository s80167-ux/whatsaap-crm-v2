import type { PoolClient } from "pg";
import { ProjectionRepository } from "../repositories/projectionRepository.js";

export class ProjectionService {
  constructor(private readonly projectionRepository = new ProjectionRepository()) {}

  async refreshForMessage(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      contactId: string;
      sentAt: Date;
    }
  ) {
    await this.projectionRepository.refreshConversationSummary(client, input.conversationId);
    await this.projectionRepository.refreshContactSummary(client, input.contactId);
    await this.projectionRepository.refreshDashboardMetrics(client, input.organizationId, input.sentAt);
  }

  async refreshDashboardMetric(client: PoolClient, organizationId: string, sentAt: Date) {
    await this.projectionRepository.refreshDashboardMetrics(client, organizationId, sentAt);
  }

  async refreshConversation(client: PoolClient, conversationId: string) {
    await this.projectionRepository.refreshConversationSummary(client, conversationId);
  }

  async refreshContact(client: PoolClient, contactId: string) {
    await this.projectionRepository.refreshContactSummary(client, contactId);
  }

  async listConversationSummaries(
    client: PoolClient,
    organizationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ) {
    return this.projectionRepository.listConversationSummaries(client, organizationId, options);
  }

  async listContactSummaries(
    client: PoolClient,
    organizationId: string,
    options?: {
      assignedOnly?: boolean;
      organizationUserId?: string | null;
    }
  ) {
    return this.projectionRepository.listContactSummaries(client, organizationId, options);
  }
}
