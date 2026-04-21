import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { MessageDispatchOutboxRepository, type MessageDispatchOutboxRecord } from "../repositories/messageDispatchOutboxRepository.js";
import { MessageRepository } from "../repositories/messageRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { ConnectorClient } from "./connectorClient.js";
import { ProjectionService } from "./projectionService.js";

export class MessageDispatchService {
  constructor(
    private readonly outboxRepository = new MessageDispatchOutboxRepository(),
    private readonly messageRepository = new MessageRepository(),
    private readonly conversationRepository = new ConversationRepository(),
    private readonly connectorClient = new ConnectorClient(),
    private readonly projectionService = new ProjectionService()
  ) {}

  async enqueue(
    client: PoolClient,
    input: {
      organizationId: string;
      messageId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      recipientJid: string;
      messageText: string;
    }
  ) {
    return this.outboxRepository.create(client, {
      organizationId: input.organizationId,
      messageId: input.messageId,
      conversationId: input.conversationId,
      contactId: input.contactId,
      whatsappAccountId: input.whatsappAccountId,
      recipientJid: input.recipientJid,
      messageText: input.messageText
    });
  }

  async enqueueInNewTransaction(input: {
    organizationId: string;
    messageId: string;
    conversationId: string;
    contactId: string;
    whatsappAccountId: string;
    recipientJid: string;
    messageText: string;
  }) {
    return withTransaction((client) =>
      this.outboxRepository.create(client, {
        organizationId: input.organizationId,
        messageId: input.messageId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        whatsappAccountId: input.whatsappAccountId,
        recipientJid: input.recipientJid,
        messageText: input.messageText
      })
    );
  }

  async processPendingBatch(limit = env.MESSAGE_OUTBOX_WORKER_BATCH_SIZE) {
    const staleBefore = new Date(Date.now() - env.MESSAGE_OUTBOX_WORKER_STALE_AFTER_MS);

    await withTransaction((client) => this.outboxRepository.resetStaleProcessing(client, staleBefore));
    const claimed = await withTransaction((client) =>
      this.outboxRepository.claimPendingBatch(client, limit, env.MESSAGE_OUTBOX_WORKER_MAX_RETRIES)
    );

    for (const job of claimed) {
      await this.processJob(job);
    }

    return claimed.length;
  }

  private async processJob(job: MessageDispatchOutboxRecord) {
    try {
      const outbound = await this.connectorClient.sendMessage({
        accountId: job.whatsapp_account_id,
        recipientJid: job.recipient_jid,
        text: job.message_text
      });

      const sentAt = new Date();
      const connectorMessageId =
        typeof outbound === "object" && outbound && "key" in outbound
          ? ((outbound as { key?: { id?: string } }).key?.id ?? null)
          : null;

      const externalMessageId = connectorMessageId ?? `dispatch:${crypto.randomUUID()}`;

      await withTransaction(async (client) => {
        await this.messageRepository.updateOutboundDispatch(client, {
          messageId: job.message_id,
          externalMessageId,
          externalChatId: job.recipient_jid,
          rawPayload: outbound ?? null,
          sentAt
        });

        await this.messageRepository.appendStatusEvent(client, {
          messageId: job.message_id,
          status: "server_ack",
          payload: outbound ?? null
        });

        await this.messageRepository.updateAckStatus(client, {
          messageId: job.message_id,
          ackStatus: "server_ack",
          deliveredAt: sentAt
        });

        await this.conversationRepository.bumpLastMessage(client, {
          conversationId: job.conversation_id,
          direction: "outgoing",
          sentAt,
          incrementUnread: false
        });

        await this.projectionService.refreshForMessage(client, {
          organizationId: job.organization_id,
          conversationId: job.conversation_id,
          contactId: job.contact_id,
          sentAt
        });

        await this.outboxRepository.markDispatched(client, {
          outboxId: job.id,
          connectorMessageId,
          payload: outbound ?? null
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to dispatch message";
      const nextAttemptAt = new Date(Date.now() + Math.min(job.attempt_count, 5) * 15000);

      await withTransaction(async (client) => {
        await this.messageRepository.appendStatusEvent(client, {
          messageId: job.message_id,
          status: "failed",
          payload: { error: errorMessage }
        });

        await this.messageRepository.updateAckStatus(client, {
          messageId: job.message_id,
          ackStatus: "failed",
          failedAt: new Date()
        });

        await this.outboxRepository.markFailed(client, {
          outboxId: job.id,
          errorMessage,
          nextAttemptAt,
          payload: { error: errorMessage }
        });
      });

      logger.error({ error, outboxId: job.id, messageId: job.message_id }, "Failed to dispatch outbound message");
    }
  }

  async drainOne(outboxId: string) {
    const client = await pool.connect();

    try {
      const result = await client.query<MessageDispatchOutboxRecord>(
        `
          select *
          from message_dispatch_outbox
          where id = $1
          limit 1
        `,
        [outboxId]
      );

      const job = result.rows[0] ?? null;

      if (!job) {
        return false;
      }

      await this.processJob(job);
      return true;
    } finally {
      client.release();
    }
  }
}
