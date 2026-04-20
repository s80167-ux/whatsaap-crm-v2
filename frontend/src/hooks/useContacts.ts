import { useQuery } from "@tanstack/react-query";
import { fetchContacts } from "../api/crm";

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts
  });
}
