import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../api/crm";
import { inboxQueryKeys } from "../lib/inboxCache";
import type { HistoryRange } from "../lib/historyRange";

export function useConversations(
  range?: HistoryRange,
  organizationId?: string | null,
  enabled = true,
  options?: {
    refetchIntervalMs?: number | false;
  }
) {
  return useQuery({
    queryKey: inboxQueryKeys.conversations(range, organizationId),
    queryFn: () => fetchConversations(range, organizationId),
    enabled,
    refetchInterval: options?.refetchIntervalMs,
    refetchIntervalInBackground: false
  });
}
