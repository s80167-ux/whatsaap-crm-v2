import { useQuery } from "@tanstack/react-query";
import { fetchMessages } from "../api/crm";
import { inboxQueryKeys } from "../lib/inboxCache";
import type { HistoryRange } from "../lib/historyRange";

export function useMessages(
  conversationId?: string,
  range?: HistoryRange,
  organizationId?: string | null,
  options?: {
    refetchIntervalMs?: number | false;
  }
) {
  return useQuery({
    queryKey: inboxQueryKeys.messages(conversationId, range, organizationId),
    queryFn: () => fetchMessages(conversationId!, range, organizationId),
    enabled: Boolean(conversationId),
    refetchInterval: conversationId ? options?.refetchIntervalMs : false,
    refetchIntervalInBackground: false
  });
}
