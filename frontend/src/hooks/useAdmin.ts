import { useQuery } from "@tanstack/react-query";
import { fetchOrganizations, fetchUsers, fetchWhatsAppAccounts } from "../api/admin";
import { getStoredUser } from "../lib/auth";

export function useOrganizations() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["organizations"],
    queryFn: fetchOrganizations,
    enabled: role === "super_admin"
  });
}

export function useOrganizationUsers(organizationId?: string | null) {
  return useQuery({
    queryKey: ["admin-users", organizationId ?? "all"],
    queryFn: () => fetchUsers(organizationId)
  });
}

export function useWhatsAppAccounts(organizationId?: string | null) {
  return useQuery({
    queryKey: ["whatsapp-accounts", organizationId ?? "all"],
    queryFn: () => fetchWhatsAppAccounts(organizationId)
  });
}
