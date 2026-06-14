import { useQuery } from "@tanstack/react-query";
import {
  fetchOrganizationModules,
  fetchOrganizationModuleStatus,
  fetchOrganizationAccessLimits,
  fetchGoogleSignupRequests,
  fetchOrganizations,
  fetchRolePermissions,
  fetchRolePermissionsMatrix,
  fetchUsers,
  fetchWhatsAppAccountAccess,
  fetchWhatsAppAccountAccessDetail,
  fetchWhatsAppAccounts
} from "../api/admin";
import { getStoredUser } from "../lib/auth";
import type { RolePermissionRole } from "../types/admin";
import type { ModuleKey } from "../types/modules";

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
    staleTime: 0
  });
}

export function useWhatsAppAccountAccess(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["whatsapp-account-access", organizationId ?? "current"],
    queryFn: () => fetchWhatsAppAccountAccess(organizationId),
    enabled
  });
}

export function useWhatsAppAccountAccessDetail(whatsappAccountId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["whatsapp-account-access-detail", whatsappAccountId],
    queryFn: () => fetchWhatsAppAccountAccessDetail(whatsappAccountId ?? ""),
    enabled: enabled && Boolean(whatsappAccountId)
  });
}

export function useOrganizationModuleStatus(moduleKey: ModuleKey, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["organization-module-status", moduleKey, organizationId ?? "current"],
    queryFn: () => fetchOrganizationModuleStatus(moduleKey, organizationId),
    enabled
  });
}

export function useCampaignsModuleStatus(organizationId?: string | null, enabled = true) {
  return useOrganizationModuleStatus("campaign", organizationId, enabled);
}

export function useCampaignWhatsAppModuleStatus(organizationId?: string | null, enabled = true) {
  return useOrganizationModuleStatus("campaign.whatsapp", organizationId, enabled);
}

export function useCampaignEmailModuleStatus(organizationId?: string | null, enabled = true) {
  return useOrganizationModuleStatus("campaign.email", organizationId, enabled);
}

export function useAiMessageAssistModuleStatus(organizationId?: string | null, enabled = true) {
  return useOrganizationModuleStatus("ai_message_assist", organizationId, enabled);
}

export function useInboxModuleStatus(organizationId?: string | null, enabled = true) {
  return useOrganizationModuleStatus("inbox", organizationId, enabled);
}

export function useCrmModuleStatus(organizationId?: string | null, enabled = true) {
  return useOrganizationModuleStatus("crm", organizationId, enabled);
}

export function useSalesModuleStatus(organizationId?: string | null, enabled = true) {
  return useOrganizationModuleStatus("sales", organizationId, enabled);
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

export function useRolePermissionsMatrix(enabled = true) {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["role-permissions"],
    queryFn: fetchRolePermissionsMatrix,
    enabled: enabled && role === "super_admin"
  });
}

export function useRolePermissions(roleName?: RolePermissionRole | null, enabled = true) {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["role-permissions", roleName],
    queryFn: () => fetchRolePermissions(roleName ?? "org_admin"),
    enabled: enabled && role === "super_admin" && Boolean(roleName)
  });
}
