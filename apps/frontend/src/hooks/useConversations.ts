import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../api/crm";
import type { InboxChannelFilter } from "../api/crm";
import { inboxQueryKeys } from "../lib/inboxCache";
import type { HistoryRange } from "../lib/historyRange";

export function useConversations(
  range?: HistoryRange,
  organizationId?: string | null,
  enabled = true,
  options?: {
    refetchIntervalMs?: number | false;
    channel?: InboxChannelFilter;
  }
) {
  return useQuery({
    queryKey: inboxQueryKeys.conversations(range, organizationId, options?.channel),
    queryFn: () => fetchConversations(range, organizationId, options?.channel),
    enabled,
    refetchInterval: options?.refetchIntervalMs,
    refetchIntervalInBackground: false
  });
}
