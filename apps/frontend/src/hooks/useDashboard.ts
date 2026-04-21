import { useQuery } from "@tanstack/react-query";
import {
  fetchPlatformAuditLogs,
  fetchPlatformHealth,
  fetchPlatformOrganizations,
  fetchPlatformOutboundDispatch,
  fetchPlatformUsage,
  fetchRoleDashboard
} from "../api/dashboard";
import { getStoredUser } from "../lib/auth";

function resolveDashboardPath() {
  const role = getStoredUser()?.role;

  if (role === "super_admin") {
    return "super-admin" as const;
  }

  if (role === "org_admin" || role === "manager") {
    return "admin" as const;
  }

  return "agent" as const;
}

export function useRoleDashboard() {
  return useQuery({
    queryKey: ["role-dashboard", resolveDashboardPath()],
    queryFn: () => fetchRoleDashboard(resolveDashboardPath())
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
