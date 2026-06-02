import { pool } from "../config/database.js";
import type { PoolClient } from "pg";
import { ContactRepository } from "../repositories/contactRepository.js";
import { ConversationService } from "./conversationService.js";
import { MessageRepository, type MessagePaginationCursor } from "../repositories/messageRepository.js";
import { SalesRepository } from "../repositories/salesRepository.js";
import type { AuthUser } from "../types/auth.js";
import type { ConversationSummaryRow } from "../repositories/projectionRepository.js";
import type { MessageRecord } from "../types/domain.js";

export interface ActivityRangeFilter {
  since: string;
}

export type InboxChannelFilter = "all" | "whatsapp" | "social" | "facebook" | "instagram";

export class QueryService {
  constructor(
    private readonly contactRepository = new ContactRepository(),
    private readonly conversationService = new ConversationService(),
    private readonly messageRepository = new MessageRepository(),
    private readonly salesRepository = new SalesRepository()
  ) {}

  private getScope(authUser: AuthUser) {
    const canReadAll =
      authUser.permissionKeys.includes("contacts.read_all") ||
      authUser.permissionKeys.includes("conversations.read_all");
    const assignedOnly =
      !canReadAll &&
      (authUser.permissionKeys.includes("contacts.read_assigned") ||
        authUser.permissionKeys.includes("conversations.read_assigned"));

    return {
      assignedOnly,
      organizationUserId: authUser.organizationUserId
    };
  }

  async listContacts(authUser: AuthUser, organizationId: string | null, activityRange?: ActivityRangeFilter) {
    const client = await pool.connect();
    try {
      return await this.contactRepository.list(client, organizationId, {
        ...this.getScope(authUser),
        activityRange
      });
    } finally {
      client.release();
    }
  }

  async getContact(authUser: AuthUser, organizationId: string | null, contactId: string) {
    const client = await pool.connect();
    try {
      const contact = await this.contactRepository.findById(client, organizationId, contactId, this.getScope(authUser));

      if (contact?.status === "merged" && contact.merged_into_contact_id) {
        return {
          is_merged: true,
          redirect_to_contact_id: contact.merged_into_contact_id,
          redirect_to_conversation_id: null
        };
      }

      return contact;
    } finally {
      client.release();
    }
  }

  async listConversations(
    authUser: AuthUser,
    organizationId: string | null,
    options?: {
      activityRange?: ActivityRangeFilter;
      channel?: InboxChannelFilter;
    }
  ) {
    const client = await pool.connect();
    try {
      return await this.conversationService.list(client, organizationId, {
        ...this.getScope(authUser),
        activityRange: options?.activityRange,
        channel: options?.channel
      });
    } finally {
      client.release();
    }
  }

  async listMobileConversations(
    authUser: AuthUser,
    organizationId: string | null,
    options?: {
      activityRange?: ActivityRangeFilter;
      channel?: InboxChannelFilter;
    }
  ) {
    const client = await pool.connect();
    try {
      const conversations = await this.conversationService.list(client, organizationId, {
        ...this.getScope(authUser),
        activityRange: options?.activityRange,
        channel: options?.channel
      });
      const summaries = await this.salesRepository.listMobileSummariesForConversations(client, {
        organizationId,
        conversationIds: conversations.map((conversation) => conversation.id)
      });
      const summaryByConversationId = new Map(
        summaries
          .filter((summary) => summary.conversation_id)
          .map((summary) => [summary.conversation_id as string, summary])
      );

      return conversations.map((conversation): ConversationSummaryRow => {
        const summary = summaryByConversationId.get(conversation.id);
        if (!summary) {
          return conversation;
        }

        return {
          ...conversation,
          has_sales: true,
          sales_id: summary.sales_id,
          sales_status: summary.sales_status,
          sales_label: summary.sales_label
        };
      });
    } finally {
      client.release();
    }
  }

  async listMessages(authUser: AuthUser, organizationId: string | null, conversationId: string, activityRange?: ActivityRangeFilter) {
    const client = await pool.connect();
    try {
      return await this.messageRepository.listByConversation(client, organizationId, conversationId, {
        ...this.getScope(authUser),
        activityRange
      });
    } finally {
      client.release();
    }
  }

  async listMobileMessages(
    authUser: AuthUser,
    organizationId: string | null,
    conversationId: string,
    activityRange?: ActivityRangeFilter
  ) {
    const client = await pool.connect();
    try {
      const messages = await this.messageRepository.listByConversation(client, organizationId, conversationId, {
        ...this.getScope(authUser),
        activityRange
      });

      return await this.enrichMobileMessages(client, organizationId, messages);
    } finally {
      client.release();
    }
  }

  async listMessagesPage(
    authUser: AuthUser,
    organizationId: string | null,
    conversationId: string,
    input: {
      activityRange?: ActivityRangeFilter;
      limit: number;
      before?: MessagePaginationCursor | null;
    }
  ) {
    const client = await pool.connect();
    try {
      return await this.messageRepository.listByConversationPage(client, organizationId, conversationId, {
        ...this.getScope(authUser),
        activityRange: input.activityRange,
        limit: input.limit,
        before: input.before
      });
    } finally {
      client.release();
    }
  }

  async listMobileMessagesPage(
    authUser: AuthUser,
    organizationId: string | null,
    conversationId: string,
    input: {
      activityRange?: ActivityRangeFilter;
      limit: number;
      before?: MessagePaginationCursor | null;
    }
  ) {
    const client = await pool.connect();
    try {
      const page = await this.messageRepository.listByConversationPage(client, organizationId, conversationId, {
        ...this.getScope(authUser),
        activityRange: input.activityRange,
        limit: input.limit,
        before: input.before
      });

      return {
        ...page,
        messages: await this.enrichMobileMessages(client, organizationId, page.messages)
      };
    } finally {
      client.release();
    }
  }

  private async enrichMobileMessages(client: PoolClient, organizationId: string | null, messages: MessageRecord[]) {
    const messageIds = messages.map((message) => message.id);
    const replyTargetIds = messages
      .map((message) => message.reply_to_message_id)
      .filter((messageId): messageId is string => Boolean(messageId));

    const [salesSummaries, replyPreviews] = await Promise.all([
      this.salesRepository.listMobileSummariesForMessages(client, {
        organizationId,
        messageIds
      }),
      this.messageRepository.listReplyPreviews(client, {
        organizationId,
        messageIds: replyTargetIds
      })
    ]);
    const summaryByMessageId = new Map(
      salesSummaries
        .filter((summary) => summary.message_id)
        .map((summary) => [summary.message_id as string, summary])
    );
    const previewByMessageId = new Map(replyPreviews.map((preview) => [preview.id, preview.preview_text]));

    return messages.map((message): MessageRecord => {
      const summary = summaryByMessageId.get(message.id);
      return {
        ...message,
        reply_preview_text: message.reply_to_message_id
          ? previewByMessageId.get(message.reply_to_message_id) ?? null
          : null,
        has_sales: Boolean(summary),
        sales_id: summary?.sales_id ?? null,
        sales_status: summary?.sales_status ?? null,
        sales_label: summary?.sales_label ?? null
      };
    });
  }
}
