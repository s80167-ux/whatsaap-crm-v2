import { useQuery } from "@tanstack/react-query";
import { fetchLeads } from "../api/crm";

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads
  });
}
