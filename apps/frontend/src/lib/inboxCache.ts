import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { HistoryRange } from "./historyRange";
import type { Conversation, Message } from "../types/api";
import { getConversationPreview, resolveMessageType } from "./messageContent";

const CURRENT_ORGANIZATION_SCOPE = "current";

export const inboxQueryKeys = {
  conversationsRoot: ["conversations"] as const,
  messagesRoot: ["messages"] as const,
  conversations: (range?: HistoryRange, organizationId?: string | null) =>
    ["conversations", range?.unit, range?.value, organizationId ?? CURRENT_ORGANIZATION_SCOPE] as const,
  messages: (conversationId?: string, range?: HistoryRange, organizationId?: string | null) =>
    ["messages", conversationId, range?.unit, range?.value, organizationId ?? CURRENT_ORGANIZATION_SCOPE] as const,
  conversationMessagesRoot: (conversationId: string) => ["messages", conversationId] as const
};

function hasMessageIdentity(message: Partial<Message>): message is Message {
  return Boolean(message.id && message.conversation_id);
}

function messageMatches(left: Message, right: Message) {
  return (
    left.id === right.id ||
    (Boolean(left.external_message_id) &&
      Boolean(right.external_message_id) &&
      left.external_message_id === right.external_message_id)
  );
}

function sortMessages(messages: Message[]) {
  return [...messages].sort((left, right) => new Date(left.sent_at).getTime() - new Date(right.sent_at).getTime());
}

function mergeMessage(existing: Message, incoming: Message): Message {
  return {
    ...existing,
    ...incoming,
    ack_status: incoming.ack_status ?? existing.ack_status,
    delivered_at: incoming.delivered_at ?? existing.delivered_at,
    read_at: incoming.read_at ?? existing.read_at
  };
}

function isMessageArray(value: unknown): value is Message[] {
  return Array.isArray(value);
}

function isConversationArray(value: unknown): value is Conversation[] {
  return Array.isArray(value);
}

export function upsertMessageInCache(queryClient: QueryClient, message: Message) {
  if (!hasMessageIdentity(message)) {
    return false;
  }

  let patched = false;
  queryClient.setQueriesData<Message[]>(
    { queryKey: inboxQueryKeys.conversationMessagesRoot(message.conversation_id) },
    (current) => {
      if (!isMessageArray(current)) {
        return current;
      }

      const existingIndex = current.findIndex((item) => messageMatches(item, message));
      patched = true;

      if (existingIndex === -1) {
        return sortMessages([...current, message]);
      }

      const next = [...current];
      next[existingIndex] = mergeMessage(next[existingIndex], message);
      return sortMessages(next);
    }
  );

  return patched;
}

export function replaceOptimisticMessageInCache(queryClient: QueryClient, optimisticId: string, realMessage: Message) {
  let patched = false;
  queryClient.setQueriesData<Message[]>(
    { queryKey: inboxQueryKeys.conversationMessagesRoot(realMessage.conversation_id) },
    (current) => {
      if (!isMessageArray(current)) {
        return current;
      }

      const next = current.filter((message) => message.id !== optimisticId && !messageMatches(message, realMessage));
      patched = true;
      return sortMessages([...next, realMessage]);
    }
  );

  return patched;
}

export function markMessagesDeletedInCache(queryClient: QueryClient, conversationId: string, messageIds: string[]) {
  const idSet = new Set(messageIds);
  let patched = false;

  queryClient.setQueriesData<Message[]>({ queryKey: inboxQueryKeys.conversationMessagesRoot(conversationId) }, (current) => {
    if (!isMessageArray(current)) {
      return current;
    }

    patched = true;
    return current.map((message) => (idSet.has(message.id) ? { ...message, is_deleted: true } : message));
  });

  return patched;
}

export function updateMessageAckInCache(queryClient: QueryClient, conversationId: string, messageId: string, ackStatus: string) {
  let patched = false;

  queryClient.setQueriesData<Message[]>({ queryKey: inboxQueryKeys.conversationMessagesRoot(conversationId) }, (current) => {
    if (!isMessageArray(current)) {
      return current;
    }

    return current.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      patched = true;
      return { ...message, ack_status: ackStatus };
    });
  });

  return patched;
}

function conversationSortTime(conversation: Conversation) {
  return conversation.last_message_at ? new Date(conversation.last_message_at).getTime() : 0;
}

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((left, right) => conversationSortTime(right) - conversationSortTime(left));
}

export function upsertConversationInCache(queryClient: QueryClient, conversation: Conversation) {
  if (!conversation.id) {
    return false;
  }

  let patched = false;
  queryClient.setQueriesData<Conversation[]>({ queryKey: inboxQueryKeys.conversationsRoot }, (current) => {
    if (!isConversationArray(current)) {
      return current;
    }

    const existingIndex = current.findIndex((item) => item.id === conversation.id);

    if (existingIndex === -1) {
      patched = true;
      return sortConversations([conversation, ...current]);
    }

    const existing = current[existingIndex];
    const shouldMoveToTop = existing.last_message_at !== conversation.last_message_at;
    const next = [...current];
    next[existingIndex] = { ...existing, ...conversation };
    patched = true;
    return shouldMoveToTop ? sortConversations(next) : next;
  });

  return patched;
}

export function patchConversationInCache(
  queryClient: QueryClient,
  conversationId: string,
  updater: (conversation: Conversation) => Conversation
) {
  let patched = false;

  queryClient.setQueriesData<Conversation[]>({ queryKey: inboxQueryKeys.conversationsRoot }, (current) => {
    if (!isConversationArray(current)) {
      return current;
    }

    return current.map((conversation) => {
      if (conversation.id !== conversationId) {
        return conversation;
      }

      patched = true;
      return updater(conversation);
    });
  });

  return patched;
}

export function patchConversationFromMessageInCache(
  queryClient: QueryClient,
  message: Message,
  options?: { deleted?: boolean; incrementUnread?: boolean }
) {
  if (!hasMessageIdentity(message)) {
    return false;
  }

  let patched = false;
  queryClient.setQueriesData<Conversation[]>({ queryKey: inboxQueryKeys.conversationsRoot }, (current) => {
    if (!isConversationArray(current)) {
      return current;
    }

    const existingIndex = current.findIndex((conversation) => conversation.id === message.conversation_id);
    if (existingIndex === -1) {
      return current;
    }

    const existing = current[existingIndex];
    const normalizedMessageType = resolveMessageType(message);
    const preview = options?.deleted
      ? "This message was deleted"
      : message.content_text || getConversationPreview(null, normalizedMessageType);
    const nextConversation: Conversation = {
      ...existing,
      last_message_at: message.sent_at ?? existing.last_message_at,
      last_message_preview: preview,
      last_message_type: normalizedMessageType ?? existing.last_message_type,
      last_message_direction: message.direction ?? existing.last_message_direction,
      last_incoming_at: message.direction === "incoming" ? message.sent_at : existing.last_incoming_at,
      last_outgoing_at: message.direction === "outgoing" ? message.sent_at : existing.last_outgoing_at,
      unread_count:
        options?.incrementUnread && message.direction === "incoming" && existing.last_message_at !== message.sent_at
          ? existing.unread_count + 1
          : existing.unread_count
    };
    const next = [...current];
    next[existingIndex] = nextConversation;
    patched = true;
    return sortConversations(next);
  });

  return patched;
}

export function hasConversationInCache(queryClient: QueryClient, conversationId: string) {
  return queryClient
    .getQueriesData<Conversation[]>({ queryKey: inboxQueryKeys.conversationsRoot })
    .some(([, data]) => isConversationArray(data) && data.some((conversation) => conversation.id === conversationId));
}

export function refetchActiveInboxFallback(queryClient: QueryClient, queryKey: QueryKey) {
  void queryClient.refetchQueries({ queryKey, type: "active" });
}
