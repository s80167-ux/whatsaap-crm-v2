import { useQuery } from "@tanstack/react-query";
import {
  fetchOrganizationModules,
  fetchOrganizationModuleStatus,
  fetchOrganizationAccessLimits,
  fetchGoogleSignupRequests,
  fetchOrganizations,
  fetchUsers,
  fetchWhatsAppAccounts
} from "../api/admin";
import { getStoredUser } from "../lib/auth";

export function useOrganizations() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["organizations"],
    queryFn: fetchOrganizations,
    enabled: role === "super_admin"
  });
}

export function useOrganizationUsers(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["admin-users", organizationId ?? "all"],
    queryFn: () => fetchUsers(organizationId),
    enabled
  });
}

export function useWhatsAppAccounts(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["whatsapp-accounts", organizationId ?? "all"],
    queryFn: () => fetchWhatsAppAccounts(organizationId),
    enabled,
    refetchInterval: organizationId ? 3000 : false,
    staleTime: 0
  });
}

export function useCampaignsModuleStatus(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["organization-module-status", "campaigns", organizationId ?? "current"],
    queryFn: () => fetchOrganizationModuleStatus("campaigns", organizationId),
    enabled
  });
}

export function useOrganizationModules(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["organization-modules", organizationId],
    queryFn: () => fetchOrganizationModules(organizationId ?? ""),
    enabled: enabled && Boolean(organizationId)
  });
}

export function useOrganizationAccessLimits(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["organization-access-limits", organizationId],
    queryFn: () => fetchOrganizationAccessLimits(organizationId ?? ""),
    enabled: enabled && Boolean(organizationId)
  });
}

export function useGoogleSignupRequests(enabled = true) {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["google-signup-requests", "pending"],
    queryFn: () => fetchGoogleSignupRequests("pending"),
    enabled: enabled && role === "super_admin"
  });
}
