import { useQuery } from "@tanstack/react-query";
import { fetchQuickReplies } from "../api/crm";

export function useQuickReplies(input?: {
  organizationId?: string | null;
  includeInactive?: boolean;
  enabled?: boolean;
}) {
  const organizationId = input?.organizationId ?? null;
  const hasOrganizationId = Boolean(organizationId);

  return useQuery({
    queryKey: ["quick-replies", organizationId ?? "none", input?.includeInactive ? "all" : "active"],
    queryFn: () =>
      fetchQuickReplies({
        organizationId,
        includeInactive: input?.includeInactive
      }),
    enabled: (input?.enabled ?? true) && hasOrganizationId
  });
}
