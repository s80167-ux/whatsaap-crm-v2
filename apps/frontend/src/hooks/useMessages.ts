import { useQuery } from "@tanstack/react-query";
import { fetchMessages } from "../api/crm";
import type { HistoryRange } from "../lib/historyRange";

export function useMessages(conversationId?: string, range?: HistoryRange, organizationId?: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId, range?.unit, range?.value, organizationId ?? "current"],
    queryFn: () => fetchMessages(conversationId!, range, organizationId),
    enabled: Boolean(conversationId)
  });
}
