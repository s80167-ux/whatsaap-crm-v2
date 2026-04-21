import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../api/crm";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations
  });
}
