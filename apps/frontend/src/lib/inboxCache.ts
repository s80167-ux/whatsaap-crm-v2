import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { HistoryRange } from "./historyRange";
import type { Conversation, Message } from "../types/api";
import type { InboxChannelFilter } from "../api/crm";
import { getConversationPreview, resolveMessageType } from "./messageContent";

const CURRENT_ORGANIZATION_SCOPE = "current";
const OUTGOING_ECHO_MERGE_WINDOW_MS = 2 * 60 * 1000;
const OUTGOING_STATUS_RANK: Record<string, number> = {
  failed: 0,
  pending: 1,
  queued: 1,
  server_ack: 2,
  device_delivered: 3,
  read: 4,
  played: 5
};

export const inboxQueryKeys = {
  conversationsRoot: ["conversations"] as const,
  messagesRoot: ["messages"] as const,
  conversations: (range?: HistoryRange, organizationId?: string | null, channel?: InboxChannelFilter) =>
    ["conversations", range?.unit, range?.value, organizationId ?? CURRENT_ORGANIZATION_SCOPE, channel ?? "all"] as const,
  messages: (conversationId?: string, range?: HistoryRange, organizationId?: string | null) =>
    ["messages", conversationId, range?.unit, range?.value, organizationId ?? CURRENT_ORGANIZATION_SCOPE] as const,
  conversationMessagesRoot: (conversationId: string) => ["messages", conversationId] as const
};

function hasMessageIdentity(message: Partial<Message>): message is Message {
  return Boolean(message.id && message.conversation_id);
}

function getMessageTime(message: Message) {
  const timestamp = new Date(message.sort_at ?? message.sent_at ?? message.created_at ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeMessageText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function getAckRank(status?: string | null) {
  return OUTGOING_STATUS_RANK[status ?? "pending"] ?? 1;
}

function isTemporaryOutboundIdentifier(value: string | null | undefined) {
  return Boolean(value?.startsWith("optimistic-") || value?.startsWith("queued:"));
}

function isUnresolvedOutbound(message: Message) {
  return (
    message.direction === "outgoing" &&
    (isTemporaryOutboundIdentifier(message.id) ||
      isTemporaryOutboundIdentifier(message.external_message_id) ||
      ["pending", "queued", "failed"].includes(message.ack_status ?? "pending"))
  );
}

function hasConfirmedOutboundIdentity(message: Message) {
  return (
    message.direction === "outgoing" &&
    !isTemporaryOutboundIdentifier(message.id) &&
    !isTemporaryOutboundIdentifier(message.external_message_id) &&
    Boolean(message.external_message_id || getAckRank(message.ack_status) >= OUTGOING_STATUS_RANK.server_ack)
  );
}

function isLikelySameOutgoingEcho(left: Message, right: Message) {
  if (left.direction !== "outgoing" || right.direction !== "outgoing") {
    return false;
  }

  if (left.conversation_id !== right.conversation_id) {
    return false;
  }

  if (left.whatsapp_account_id && right.whatsapp_account_id && left.whatsapp_account_id !== right.whatsapp_account_id) {
    return false;
  }

  if (left.contact_id && right.contact_id && left.contact_id !== right.contact_id) {
    return false;
  }

  const leftText = normalizeMessageText(left.content_text);
  const rightText = normalizeMessageText(right.content_text);

  if (!leftText || !rightText || leftText !== rightText) {
    return false;
  }

  const timeDelta = Math.abs(getMessageTime(left) - getMessageTime(right));
  if (timeDelta > OUTGOING_ECHO_MERGE_WINDOW_MS) {
    return false;
  }

  return (
    (isUnresolvedOutbound(left) && (isUnresolvedOutbound(right) || hasConfirmedOutboundIdentity(right))) ||
    (isUnresolvedOutbound(right) && (isUnresolvedOutbound(left) || hasConfirmedOutboundIdentity(left)))
  );
}

function messageMatches(left: Message, right: Message) {
  return (
    left.id === right.id ||
    (Boolean(left.external_message_id) &&
      Boolean(right.external_message_id) &&
      left.external_message_id === right.external_message_id) ||
    isLikelySameOutgoingEcho(left, right)
  );
}

function sortMessages(messages: Message[]) {
  return [...messages].sort((left, right) => getMessageTime(left) - getMessageTime(right));
}

function shouldPreferIncomingIdentity(existing: Message, incoming: Message) {
  if (isUnresolvedOutbound(existing) && hasConfirmedOutboundIdentity(incoming)) {
    return true;
  }

  if (hasConfirmedOutboundIdentity(existing) && isUnresolvedOutbound(incoming)) {
    return false;
  }

  return getAckRank(incoming.ack_status) >= getAckRank(existing.ack_status);
}

function resolveMergedAckStatus(existing: Message, incoming: Message) {
  return getAckRank(incoming.ack_status) >= getAckRank(existing.ack_status)
    ? incoming.ack_status ?? existing.ack_status
    : existing.ack_status ?? incoming.ack_status;
}

function mergeMessage(existing: Message, incoming: Message): Message {
  const preferIncoming = shouldPreferIncomingIdentity(existing, incoming);
  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;

  return {
    ...secondary,
    ...primary,
    content_text: primary.content_text ?? secondary.content_text,
    content_json: primary.content_json ?? secondary.content_json,
    ack_status: resolveMergedAckStatus(existing, incoming),
    delivered_at: incoming.delivered_at ?? existing.delivered_at,
    read_at: incoming.read_at ?? existing.read_at
  };
}

export function compactOutgoingEchoDuplicates(messages: Message[]) {
  const compacted: Message[] = [];

  for (const message of sortMessages(messages)) {
    const existingIndex = compacted.findIndex((item) => messageMatches(item, message));

    if (existingIndex === -1) {
      compacted.push(message);
      continue;
    }

    compacted[existingIndex] = mergeMessage(compacted[existingIndex], message);
  }

  return sortMessages(compacted);
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
        return compactOutgoingEchoDuplicates([...current, message]);
      }

      const next = [...current];
      next[existingIndex] = mergeMessage(next[existingIndex], message);
      return compactOutgoingEchoDuplicates(next);
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
      return compactOutgoingEchoDuplicates([...next, realMessage]);
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

    const next = current.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      patched = true;

      if (ackStatus === "failed" && isTemporaryOutboundIdentifier(message.id)) {
        return { ...message, ack_status: "pending" };
      }

      return { ...message, ack_status: ackStatus };
    });

    return compactOutgoingEchoDuplicates(next);
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
