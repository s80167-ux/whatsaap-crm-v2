import { useQuery } from "@tanstack/react-query";
import { fetchMessages } from "../api/crm";
import type { HistoryRange } from "../lib/historyRange";

export function useMessages(conversationId?: string, range?: HistoryRange) {
  return useQuery({
    queryKey: ["messages", conversationId, range?.unit, range?.value],
    queryFn: () => fetchMessages(conversationId!, range),
    enabled: Boolean(conversationId)
  });
}
