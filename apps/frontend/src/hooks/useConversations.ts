import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../api/crm";
import type { HistoryRange } from "../lib/historyRange";

export function useConversations(range?: HistoryRange) {
  return useQuery({
    queryKey: ["conversations", range?.unit, range?.value],
    queryFn: () => fetchConversations(range)
  });
}
