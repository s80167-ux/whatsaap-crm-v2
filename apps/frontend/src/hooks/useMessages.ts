import { useQuery } from "@tanstack/react-query";
import { fetchMessages } from "../api/crm";

export function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages(conversationId!),
    enabled: Boolean(conversationId)
  });
}
