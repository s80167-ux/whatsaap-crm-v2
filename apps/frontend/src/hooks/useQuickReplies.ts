import { useQuery } from "@tanstack/react-query";
import { fetchQuickReplies } from "../api/crm";

export function useQuickReplies(input?: {
  organizationId?: string | null;
  includeInactive?: boolean;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["quick-replies", input?.organizationId ?? "current", input?.includeInactive ? "all" : "active"],
    queryFn: () =>
      fetchQuickReplies({
        organizationId: input?.organizationId,
        includeInactive: input?.includeInactive
      }),
    enabled: input?.enabled ?? true
  });
}
