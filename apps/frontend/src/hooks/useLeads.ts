import { useQuery } from "@tanstack/react-query";
import { fetchLead, fetchLeadHistory, fetchLeads } from "../api/crm";

function getOrganizationQueryKey(organizationId?: string | null) {
  return organizationId === null ? "all" : organizationId ?? "current";
}

export function useLeads(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["leads", getOrganizationQueryKey(organizationId)],
    queryFn: () => fetchLeads(organizationId),
    enabled
  });
}

export function useLeadDetail(leadId?: string, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["lead", leadId, getOrganizationQueryKey(organizationId)],
    queryFn: () => fetchLead(leadId!, organizationId),
    enabled: Boolean(leadId) && enabled
  });
}

export function useLeadHistory(leadId?: string, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["lead-history", leadId, getOrganizationQueryKey(organizationId)],
    queryFn: () => fetchLeadHistory(leadId!, organizationId),
    enabled: Boolean(leadId) && enabled
  });
}
