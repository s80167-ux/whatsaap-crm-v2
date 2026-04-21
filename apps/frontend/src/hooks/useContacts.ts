import { useQuery } from "@tanstack/react-query";
import { fetchContact, fetchContacts } from "../api/crm";

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts
  });
}

export function useContact(contactId?: string) {
  return useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => fetchContact(contactId!),
    enabled: Boolean(contactId)
  });
}
