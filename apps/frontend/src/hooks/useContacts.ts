import { useQuery } from "@tanstack/react-query";
import { fetchContact, fetchContacts } from "../api/crm";
import type { HistoryRange } from "../lib/historyRange";

export function useContacts(range?: HistoryRange) {
  return useQuery({
    queryKey: ["contacts", range?.unit, range?.value],
    queryFn: () => fetchContacts(range)
  });
}

export function useContact(contactId?: string) {
  return useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => fetchContact(contactId!),
    enabled: Boolean(contactId)
  });
}
