import type { PoolClient, QueryResultRow } from "pg";
import type { AuthUser } from "../../../types/auth.js";

export type DashboardScope = "agent" | "admin" | "super_admin";
export type DashboardWidgetStatus = "healthy" | "warning" | "critical" | "locked" | "empty";
export type DashboardMetricTone = "neutral" | "success" | "warning" | "danger" | "primary";
export type DashboardAlertSeverity = "info" | "warning" | "critical";

export type DashboardWidgetMetric = {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: DashboardMetricTone;
};

export type DashboardWidgetAlert = {
  severity: DashboardAlertSeverity;
  message: string;
  href?: string;
};

export type DashboardWidgetQuickAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

export type DashboardWidget = {
  id: string;
  moduleKey: string;
  title: string;
  description: string;
  status: DashboardWidgetStatus;
  priority: number;
  href: string;
  metrics: DashboardWidgetMetric[];
  alerts: DashboardWidgetAlert[];
  quickActions: DashboardWidgetQuickAction[];
  updatedAt: string;
};

export type DashboardProviderContext = {
  organizationId: string | null;
  scope: DashboardScope;
  generatedAt: string;
};

export type DashboardProvider = {
  moduleKey: string;
  moduleAliases?: string[];
  title: string;
  description: string;
  priority: number;
  getWidget(authUser: AuthUser, client: PoolClient, context: DashboardProviderContext): Promise<DashboardWidget>;
};

export function isMissingRelationError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42P01";
}

export async function safeQuery<T extends QueryResultRow>(
  client: PoolClient,
  queryText: string,
  params: unknown[],
  fallback: T[]
): Promise<T[]> {
  try {
    const result = await client.query<T>(queryText, params);
    return result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return fallback;
    }

    throw error;
  }
}

export function createWidget(input: Omit<DashboardWidget, "updatedAt"> & { updatedAt?: string }): DashboardWidget {
  return {
    ...input,
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}
