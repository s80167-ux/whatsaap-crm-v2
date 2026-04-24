import { useQuery } from "@tanstack/react-query";
import { fetchQuickReplyAnalytics } from "../api/crm";

export function useQuickReplyAnalytics(input?: {
  organizationId?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["quick-reply-analytics", input?.organizationId ?? "current"],
    queryFn: () =>
      fetchQuickReplyAnalytics({
        organizationId: input?.organizationId
      }),
    enabled: input?.enabled ?? true
  });
}
