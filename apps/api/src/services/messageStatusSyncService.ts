import type { PoolClient } from "pg";
import { MessageRepository } from "../repositories/messageRepository.js";

type AckStatus = "pending" | "server_ack" | "device_delivered" | "read" | "played" | "failed";

const ACK_STATUS_RANK: Record<AckStatus, number> = {
  failed: 0,
  pending: 1,
  server_ack: 2,
  device_delivered: 3,
  read: 4,
  played: 5
};

export class MessageStatusSyncService {
  constructor(private readonly messageRepository = new MessageRepository()) {}

  private shouldApplyStatus(currentStatus: string | undefined, nextStatus: AckStatus) {
    const currentRank = ACK_STATUS_RANK[(currentStatus as AckStatus | undefined) ?? "pending"] ?? 0;
    const nextRank = ACK_STATUS_RANK[nextStatus];
    return currentStatus === "failed" || nextRank >= currentRank;
  }

  async apply(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      externalMessageId: string;
      ackStatus: AckStatus;
      eventAt: Date;
      rawPayload: unknown;
    }
  ) {
    const message = await this.messageRepository.findByExternalMessageId(client, {
      organizationId: input.organizationId,
      whatsappAccountId: input.whatsappAccountId,
      externalMessageId: input.externalMessageId
    });

    if (!message) {
      throw new Error(`Message not found for status event: ${input.externalMessageId}`);
    }

    await this.messageRepository.appendStatusEvent(client, {
      messageId: message.id,
      status: input.ackStatus,
      payload: input.rawPayload
    });

    if (!this.shouldApplyStatus(message.ack_status, input.ackStatus)) {
      return message;
    }

    await this.messageRepository.updateAckStatus(client, {
      messageId: message.id,
      ackStatus: input.ackStatus,
      deliveredAt:
        input.ackStatus === "device_delivered" || input.ackStatus === "read" || input.ackStatus === "played"
          ? input.eventAt
          : null,
      readAt: input.ackStatus === "read" || input.ackStatus === "played" ? input.eventAt : null,
      failedAt: input.ackStatus === "failed" ? input.eventAt : null
    });

    return message;
  }
}
