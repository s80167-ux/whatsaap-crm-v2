import { apiGet, apiPost } from "../lib/http";
import type {
  DashboardRouteRole,
  DashboardSummary,
  PlatformAuditLog,
  PlatformHealthSummary,
  PlatformOrganization,
  PlatformOutboundDispatchSummary,
  PlatformServiceHealthSummary,
  PlatformUsageSummary
} from "../types/dashboard";

export async function fetchRoleDashboard(role: DashboardRouteRole, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: DashboardSummary }>(`/dashboard/${role}${suffix}`);
  return response.data;
}

export async function fetchDynamicDashboard(role: DashboardRouteRole, organizationId?: string | null): Promise<DashboardSummary> {
  const dashboard = await fetchRoleDashboard(role, organizationId);
  return {
    ...dashboard,
    widgets: dashboard.widgets ?? [],
    enabledModules: dashboard.enabledModules ?? []
  };
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

export async function fetchPlatformServiceHealth() {
  const response = await apiGet<{ data: PlatformServiceHealthSummary }>("/platform/service-health");
  return response.data;
}

export async function fetchPlatformAuditLogs() {
  const response = await apiGet<{ data: PlatformAuditLog[] }>("/platform/audit-logs");
  return response.data;
}

export async function fetchPlatformOutboundDispatch() {
  const response = await apiGet<{ data: PlatformOutboundDispatchSummary }>("/platform/outbound-dispatch");
  return response.data;
}

export async function retryPlatformOutboundDispatch(payload?: {
  outboxIds?: string[];
  limit?: number;
  processNow?: boolean;
}) {
  const response = await apiPost<{ data: { retried: number; processed: number; outboxIds: string[] } }>(
    "/platform/outbound-dispatch/retry",
    payload ?? { limit: 25, processNow: true }
  );
  return response.data;
}
