import { useQuery } from "@tanstack/react-query";
import {
  fetchPlatformAuditLogs,
  fetchPlatformHealth,
  fetchPlatformOrganizations,
  fetchPlatformOutboundDispatch,
  fetchPlatformSupabaseUsage,
  fetchPlatformServiceHealth,
  fetchPlatformUsage,
  fetchDynamicDashboard
} from "../api/dashboard";
import { getStoredUser } from "../lib/auth";
import type { DashboardDateRangeDays, DashboardRouteRole } from "../types/dashboard";

function resolveDashboardPath(): DashboardRouteRole {
  const role = getStoredUser()?.role;

  if (role === "super_admin") {
    return "super-admin" as const;
  }

  if (role === "org_admin" || role === "manager") {
    return "admin" as const;
  }

  return "agent" as const;
}

export function useRoleDashboard(input?: { organizationId?: string | null; dateRangeDays?: DashboardDateRangeDays }) {
  const dashboardRole = resolveDashboardPath();
  const organizationId = dashboardRole === "super-admin" ? input?.organizationId ?? null : null;
  const dateRangeDays = input?.dateRangeDays ?? 30;

  return useQuery({
    queryKey: ["dynamic-dashboard", dashboardRole, organizationId, dateRangeDays],
    queryFn: () => fetchDynamicDashboard(dashboardRole, { organizationId, dateRangeDays })
  });
}

export function usePlatformOrganizations() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["platform-organizations"],
    queryFn: fetchPlatformOrganizations,
    enabled: role === "super_admin"
  });
}

export function usePlatformUsage() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["platform-usage"],
    queryFn: fetchPlatformUsage,
    enabled: role === "super_admin"
  });
}

export function usePlatformHealth() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["platform-health"],
    queryFn: fetchPlatformHealth,
    enabled: role === "super_admin",
    refetchInterval: 15000
  });
}

export function usePlatformServiceHealth() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["platform-service-health"],
    queryFn: fetchPlatformServiceHealth,
    enabled: role === "super_admin",
    refetchInterval: 30000
  });
}

export function usePlatformSupabaseUsage() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["platform-supabase-usage"],
    queryFn: fetchPlatformSupabaseUsage,
    enabled: role === "super_admin",
    refetchInterval: 300000
  });
}

export function usePlatformAuditLogs() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["platform-audit-logs"],
    queryFn: fetchPlatformAuditLogs,
    enabled: role === "super_admin",
    refetchInterval: 30000
  });
}

export function usePlatformOutboundDispatch() {
  const role = getStoredUser()?.role;

  return useQuery({
    queryKey: ["platform-outbound-dispatch"],
    queryFn: fetchPlatformOutboundDispatch,
    enabled: role === "super_admin",
    refetchInterval: 15000
  });
}
