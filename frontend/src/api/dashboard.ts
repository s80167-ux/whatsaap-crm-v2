import { apiGet } from "../lib/http";
import type { DashboardSummary, PlatformAuditLog, PlatformHealthSummary, PlatformOrganization, PlatformUsageSummary } from "../types/dashboard";

export async function fetchRoleDashboard(role: "agent" | "admin" | "super-admin") {
  const response = await apiGet<{ data: DashboardSummary }>(`/dashboard/${role}`);
  return response.data;
}

export async function fetchPlatformOrganizations() {
  const response = await apiGet<{ data: PlatformOrganization[] }>("/platform/organizations");
  return response.data;
}

export async function fetchPlatformUsage() {
  const response = await apiGet<{ data: PlatformUsageSummary }>("/platform/usage");
  return response.data;
}

export async function fetchPlatformHealth() {
  const response = await apiGet<{ data: PlatformHealthSummary }>("/platform/health");
  return response.data;
}

export async function fetchPlatformAuditLogs() {
  const response = await apiGet<{ data: PlatformAuditLog[] }>("/platform/audit-logs");
  return response.data;
}
