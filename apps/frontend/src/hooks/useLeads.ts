import { useQuery } from "@tanstack/react-query";
import { fetchLead, fetchLeadHistory, fetchLeads } from "../api/crm";

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads
  });
}

export function useLeadDetail(leadId?: string) {
  return useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fetchLead(leadId!),
    enabled: Boolean(leadId)
  });
}

export function useLeadHistory(leadId?: string) {
  return useQuery({
    queryKey: ["lead-history", leadId],
    queryFn: () => fetchLeadHistory(leadId!),
    enabled: Boolean(leadId)
  });
}
