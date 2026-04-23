import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../api/crm";
import type { HistoryRange } from "../lib/historyRange";

export function useConversations(range?: HistoryRange, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["conversations", range?.unit, range?.value, organizationId ?? "current"],
    queryFn: () => fetchConversations(range, organizationId),
    enabled
  });
}
