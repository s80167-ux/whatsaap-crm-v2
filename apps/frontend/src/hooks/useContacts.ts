import { useQuery } from "@tanstack/react-query";
import { fetchContact, fetchContacts } from "../api/crm";
import type { HistoryRange } from "../lib/historyRange";

export function useContacts(range?: HistoryRange, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["contacts", range?.unit, range?.value, organizationId ?? "current"],
    queryFn: () => fetchContacts(range, organizationId),
    enabled
  });
}

export function useContact(contactId?: string, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["contact", contactId, organizationId ?? "current"],
    queryFn: () => fetchContact(contactId!, organizationId),
    enabled: Boolean(contactId) && enabled
  });
}
