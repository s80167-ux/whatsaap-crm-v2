import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMessages, fetchMessagesPage, type MessagePagination } from "../api/crm";
import { inboxQueryKeys } from "../lib/inboxCache";
import type { HistoryRange } from "../lib/historyRange";
import type { Message } from "../types/api";

function sortMessages(messages: Message[]) {
  return [...messages].sort((left, right) => {
    const timeDelta = new Date(left.sent_at).getTime() - new Date(right.sent_at).getTime();
    return timeDelta || left.id.localeCompare(right.id);
  });
}

function mergeMessages(existing: Message[] | undefined, incoming: Message[]) {
  const messagesById = new Map<string, Message>();

  for (const message of existing ?? []) {
    messagesById.set(message.id, message);
  }

  for (const message of incoming) {
    messagesById.set(message.id, {
      ...messagesById.get(message.id),
      ...message
    });
  }

  return sortMessages([...messagesById.values()]);
}

export function useMessages(
  conversationId?: string,
  range?: HistoryRange,
  organizationId?: string | null,
  options?: {
    refetchIntervalMs?: number | false;
    pageSize?: number;
    onPaginationChange?: (pagination: MessagePagination | null) => void;
  }
) {
  const queryClient = useQueryClient();
  const queryKey = inboxQueryKeys.messages(conversationId, range, organizationId);

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!options?.pageSize) {
        const messages = await fetchMessages(conversationId!, range, organizationId);
        options?.onPaginationChange?.(null);
        return messages;
      }

      const page = await fetchMessagesPage(conversationId!, {
        range,
        organizationId,
        limit: options.pageSize
      });
      options.onPaginationChange?.(page.pagination);
      return mergeMessages(queryClient.getQueryData<Message[]>(queryKey), page.data);
    },
    enabled: Boolean(conversationId),
    refetchInterval: conversationId ? options?.refetchIntervalMs : false,
    refetchIntervalInBackground: false
  });
}
