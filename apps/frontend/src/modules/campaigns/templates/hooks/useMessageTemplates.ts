import { useQuery } from "@tanstack/react-query";
import { fetchMessageTemplates } from "../services/templateService";

export function getMessageTemplatesQueryKey(organizationId?: string | null) {
  return ["campaign-message-templates", organizationId ?? "current"] as const;
}

export function useMessageTemplates(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: getMessageTemplatesQueryKey(organizationId),
    queryFn: () => fetchMessageTemplates(organizationId),
    enabled
  });
}
