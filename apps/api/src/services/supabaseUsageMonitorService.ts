import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export type PlatformSupabaseUsageStatus = "healthy" | "warning" | "critical" | "unknown";
export type PlatformSupabaseUsageSourceStatus = "live" | "partial" | "unavailable";

export interface PlatformSupabaseUsageSnapshot {
  id: string;
  collected_at: string;
  overall_status: PlatformSupabaseUsageStatus;
  source_status: PlatformSupabaseUsageSourceStatus;
  db_size_bytes: string | null;
  db_disk_used_bytes: string | null;
  db_disk_total_bytes: string | null;
  db_disk_percent: string | null;
  storage_used_bytes: string | null;
  storage_quota_bytes: string | null;
  storage_percent: string | null;
  storage_object_count: string | null;
  egress_bytes: string | null;
  egress_quota_bytes: string | null;
  egress_percent: string | null;
  api_requests_count: string | null;
  raw: unknown;
  errors: unknown;
  created_at: string;
}

export interface PlatformSupabaseUsageSummary {
  latest: PlatformSupabaseUsageSnapshot | null;
  history: PlatformSupabaseUsageSnapshot[];
  stale: boolean;
  generated_at: string;
}

type UsageErrorEntry = {
  source: "database" | "storage" | "management";
  metric: string;
  message: string;
};

type SnapshotMetrics = {
  collectedAt: string;
  dbSizeBytes: number | null;
  dbDiskUsedBytes: number | null;
  dbDiskTotalBytes: number | null;
  dbDiskPercent: number | null;
  storageUsedBytes: number | null;
  storageQuotaBytes: number | null;
  storagePercent: number | null;
  storageObjectCount: number | null;
  egressBytes: number | null;
  egressQuotaBytes: number | null;
  egressPercent: number | null;
  apiRequestsCount: number | null;
  overallStatus: PlatformSupabaseUsageStatus;
  sourceStatus: PlatformSupabaseUsageSourceStatus;
  raw: Record<string, unknown>;
  errors: UsageErrorEntry[];
};

const SUPABASE_MANAGEMENT_API_BASE_URL = "https://api.supabase.com";
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export class SupabaseUsageMonitorService {
  async collectSnapshot() {
    const collectedAt = new Date().toISOString();
    const errors: UsageErrorEntry[] = [];
    const raw: Record<string, unknown> = {
      database: {},
      storage: {},
      management: {
        configured: Boolean(env.SUPABASE_MANAGEMENT_ACCESS_TOKEN && env.SUPABASE_PROJECT_REF)
      }
    };

    const dbQuotaBytes = quotaGbToBytes(env.SUPABASE_DB_QUOTA_GB);
    const storageQuotaBytes = quotaGbToBytes(env.SUPABASE_STORAGE_QUOTA_GB);
    const egressQuotaBytes = quotaGbToBytes(env.SUPABASE_EGRESS_QUOTA_GB);

    let dbSizeBytes: number | null = null;
    let dbDiskUsedBytes: number | null = null;
    let dbDiskTotalBytes: number | null = dbQuotaBytes;
    let dbDiskPercent: number | null = null;
    let storageUsedBytes: number | null = null;
    let storageObjectCount: number | null = null;
    let storagePercent: number | null = null;
    let egressBytes: number | null = null;
    let egressPercent: number | null = null;
    let apiRequestsCount: number | null = null;
    const managementRaw: Record<string, unknown> = {};

    try {
      const dbResult = await pool.query<{ db_size_bytes: string }>(
        "select pg_database_size(current_database())::bigint::text as db_size_bytes"
      );
      dbSizeBytes = parseNullableInteger(dbResult.rows[0]?.db_size_bytes ?? null);
      dbDiskUsedBytes = dbSizeBytes;
      dbDiskPercent = calculatePercent(dbDiskUsedBytes, dbDiskTotalBytes);
      raw.database = {
        db_size_bytes: dbSizeBytes,
        quota_bytes: dbDiskTotalBytes
      };
    } catch (error) {
      errors.push({
        source: "database",
        metric: "db_size_bytes",
        message: getErrorMessage(error)
      });
      logger.error({ err: error }, "Failed to collect Supabase database size");
    }

    try {
      const storageResult = await pool.query<{
        storage_used_bytes: string;
        storage_object_count: string;
      }>(
        `
          select
            coalesce(sum((metadata->>'size')::bigint), 0)::bigint::text as storage_used_bytes,
            count(*)::bigint::text as storage_object_count
          from storage.objects
        `
      );

      storageUsedBytes = parseNullableInteger(storageResult.rows[0]?.storage_used_bytes ?? null);
      storageObjectCount = parseNullableInteger(storageResult.rows[0]?.storage_object_count ?? null);
      storagePercent = calculatePercent(storageUsedBytes, storageQuotaBytes);
      raw.storage = {
        storage_used_bytes: storageUsedBytes,
        storage_object_count: storageObjectCount,
        quota_bytes: storageQuotaBytes
      };
    } catch (error) {
      errors.push({
        source: "storage",
        metric: "storage.objects",
        message: getErrorMessage(error)
      });
      logger.warn({ err: error }, "Failed to collect Supabase storage usage fallback");
      raw.storage = {
        available: false
      };
    }

    if (env.SUPABASE_MANAGEMENT_ACCESS_TOKEN && env.SUPABASE_PROJECT_REF) {
      const management = await this.collectManagementMetrics();
      managementRaw.health = management.health;
      managementRaw.project = management.project;
      managementRaw.database = management.database;

      errors.push(...management.errors);

      if (management.databaseDiskUsedBytes !== null) {
        dbDiskUsedBytes = management.databaseDiskUsedBytes;
      }
      if (management.databaseDiskTotalBytes !== null) {
        dbDiskTotalBytes = management.databaseDiskTotalBytes;
      }
      if (management.databaseDiskPercent !== null) {
        dbDiskPercent = management.databaseDiskPercent;
      } else {
        dbDiskPercent = calculatePercent(dbDiskUsedBytes, dbDiskTotalBytes);
      }

      if (management.egressBytes !== null) {
        egressBytes = management.egressBytes;
        egressPercent = calculatePercent(egressBytes, egressQuotaBytes);
      }

      if (management.apiRequestsCount !== null) {
        apiRequestsCount = management.apiRequestsCount;
      }
    } else {
      managementRaw.reason = "SUPABASE_MANAGEMENT_ACCESS_TOKEN or SUPABASE_PROJECT_REF not configured";
    }

    raw.management = managementRaw;

    const sourceStatus = resolveSourceStatus({
      dbSizeBytes,
      dbDiskUsedBytes,
      storageUsedBytes,
      egressBytes,
      apiRequestsCount,
      hasManagementConfig: Boolean(env.SUPABASE_MANAGEMENT_ACCESS_TOKEN && env.SUPABASE_PROJECT_REF),
      errors
    });

    const snapshot: SnapshotMetrics = {
      collectedAt,
      dbSizeBytes,
      dbDiskUsedBytes,
      dbDiskTotalBytes,
      dbDiskPercent: calculatePercent(dbDiskUsedBytes, dbDiskTotalBytes) ?? dbDiskPercent,
      storageUsedBytes,
      storageQuotaBytes,
      storagePercent,
      storageObjectCount,
      egressBytes,
      egressQuotaBytes,
      egressPercent,
      apiRequestsCount,
      overallStatus: resolveOverallStatus([
        calculatePercent(dbDiskUsedBytes, dbDiskTotalBytes),
        storagePercent,
        egressPercent
      ]),
      sourceStatus,
      raw,
      errors
    };

    return this.insertSnapshot(snapshot);
  }

  async getLatestSummary(): Promise<PlatformSupabaseUsageSummary> {
    const result = await pool.query<PlatformSupabaseUsageSnapshot>(
      `
        select
          id,
          collected_at,
          overall_status,
          source_status,
          db_size_bytes,
          db_disk_used_bytes,
          db_disk_total_bytes,
          db_disk_percent,
          storage_used_bytes,
          storage_quota_bytes,
          storage_percent,
          storage_object_count,
          egress_bytes,
          egress_quota_bytes,
          egress_percent,
          api_requests_count,
          raw,
          errors,
          created_at
        from platform_supabase_usage_snapshots
        order by collected_at desc
        limit 12
      `
    );

    const history = result.rows;
    const latest = history[0] ?? null;

    return {
      latest,
      history,
      stale: latest ? Date.now() - new Date(latest.collected_at).getTime() > STALE_AFTER_MS : false,
      generated_at: new Date().toISOString()
    };
  }

  private async insertSnapshot(snapshot: SnapshotMetrics) {
    const result = await pool.query<PlatformSupabaseUsageSnapshot>(
      `
        insert into platform_supabase_usage_snapshots (
          collected_at,
          overall_status,
          source_status,
          db_size_bytes,
          db_disk_used_bytes,
          db_disk_total_bytes,
          db_disk_percent,
          storage_used_bytes,
          storage_quota_bytes,
          storage_percent,
          storage_object_count,
          egress_bytes,
          egress_quota_bytes,
          egress_percent,
          api_requests_count,
          raw,
          errors
        ) values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16::jsonb,
          $17::jsonb
        )
        returning
          id,
          collected_at,
          overall_status,
          source_status,
          db_size_bytes,
          db_disk_used_bytes,
          db_disk_total_bytes,
          db_disk_percent,
          storage_used_bytes,
          storage_quota_bytes,
          storage_percent,
          storage_object_count,
          egress_bytes,
          egress_quota_bytes,
          egress_percent,
          api_requests_count,
          raw,
          errors,
          created_at
      `,
      [
        snapshot.collectedAt,
        snapshot.overallStatus,
        snapshot.sourceStatus,
        snapshot.dbSizeBytes,
        snapshot.dbDiskUsedBytes,
        snapshot.dbDiskTotalBytes,
        snapshot.dbDiskPercent,
        snapshot.storageUsedBytes,
        snapshot.storageQuotaBytes,
        snapshot.storagePercent,
        snapshot.storageObjectCount,
        snapshot.egressBytes,
        snapshot.egressQuotaBytes,
        snapshot.egressPercent,
        snapshot.apiRequestsCount,
        JSON.stringify(snapshot.raw),
        JSON.stringify(snapshot.errors)
      ]
    );

    return result.rows[0];
  }

  private async collectManagementMetrics() {
    const errors: UsageErrorEntry[] = [];
    let health: unknown = null;
    let project: unknown = null;
    let database: unknown = null;
    let databaseDiskUsedBytes: number | null = null;
    let databaseDiskTotalBytes: number | null = null;
    let databaseDiskPercent: number | null = null;
    let egressBytes: number | null = null;
    let apiRequestsCount: number | null = null;

    const healthResponse = await this.requestSupabaseManagementApi(`/v1/projects/${env.SUPABASE_PROJECT_REF}/health`);
    if (healthResponse.ok) {
      health = healthResponse.data;
    } else if (healthResponse.error) {
      errors.push(healthResponse.error);
    }

    const projectResponse = await this.requestSupabaseManagementApi(`/v1/projects/${env.SUPABASE_PROJECT_REF}`);
    if (projectResponse.ok) {
      project = projectResponse.data;
      const projectMetrics = extractProjectMetrics(projectResponse.data);
      databaseDiskUsedBytes = projectMetrics.databaseDiskUsedBytes;
      databaseDiskTotalBytes = projectMetrics.databaseDiskTotalBytes;
      databaseDiskPercent = projectMetrics.databaseDiskPercent;
      egressBytes = projectMetrics.egressBytes;
      apiRequestsCount = projectMetrics.apiRequestsCount;
    } else if (projectResponse.error) {
      errors.push(projectResponse.error);
    }

    const databaseResponse = await this.requestSupabaseManagementApi(
      `/v1/projects/${env.SUPABASE_PROJECT_REF}/database/context`
    );
    if (databaseResponse.ok) {
      database = databaseResponse.data;
      const databaseMetrics = extractProjectMetrics(databaseResponse.data);
      databaseDiskUsedBytes = databaseMetrics.databaseDiskUsedBytes ?? databaseDiskUsedBytes;
      databaseDiskTotalBytes = databaseMetrics.databaseDiskTotalBytes ?? databaseDiskTotalBytes;
      databaseDiskPercent =
        databaseMetrics.databaseDiskPercent ?? calculatePercent(databaseDiskUsedBytes, databaseDiskTotalBytes);
    } else if (databaseResponse.error) {
      errors.push(databaseResponse.error);
    }

    return {
      health,
      project,
      database,
      databaseDiskUsedBytes,
      databaseDiskTotalBytes,
      databaseDiskPercent,
      egressBytes,
      apiRequestsCount,
      errors
    };
  }

  private async requestSupabaseManagementApi(path: string): Promise<
    | { ok: true; data: unknown }
    | { ok: false; error: UsageErrorEntry }
  > {
    const url = `${SUPABASE_MANAGEMENT_API_BASE_URL}${path}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${env.SUPABASE_MANAGEMENT_ACCESS_TOKEN}`
        }
      });

      if (!response.ok) {
        const responseText = await safeReadResponseText(response);
        return {
          ok: false,
          error: {
            source: "management",
            metric: path,
            message: `Management API returned HTTP ${response.status}${responseText ? `: ${responseText}` : ""}`
          }
        };
      }

      return {
        ok: true,
        data: await response.json()
      };
    } catch (error) {
      logger.warn({ err: error, path }, "Supabase Management API request failed");
      return {
        ok: false,
        error: {
          source: "management",
          metric: path,
          message: getErrorMessage(error)
        }
      };
    }
  }
}

function quotaGbToBytes(valueGb: number) {
  return Math.round(valueGb * 1024 * 1024 * 1024);
}

function parseNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.trunc(numericValue) : null;
}

function calculatePercent(used: number | null, total: number | null) {
  if (used === null || total === null || total <= 0) {
    return null;
  }

  const percent = (used / total) * 100;
  return Number.isFinite(percent) ? Number(percent.toFixed(2)) : null;
}

function resolveOverallStatus(percentages: Array<number | null>): PlatformSupabaseUsageStatus {
  const available = percentages.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (available.length === 0) {
    return "unknown";
  }

  if (available.some((value) => value >= 90)) {
    return "critical";
  }

  if (available.some((value) => value >= 70)) {
    return "warning";
  }

  return "healthy";
}

function resolveSourceStatus(input: {
  dbSizeBytes: number | null;
  dbDiskUsedBytes: number | null;
  storageUsedBytes: number | null;
  egressBytes: number | null;
  apiRequestsCount: number | null;
  hasManagementConfig: boolean;
  errors: UsageErrorEntry[];
}): PlatformSupabaseUsageSourceStatus {
  const availableCount = [
    input.dbSizeBytes,
    input.dbDiskUsedBytes,
    input.storageUsedBytes,
    input.egressBytes,
    input.apiRequestsCount
  ].filter((value) => value !== null).length;

  if (availableCount === 0) {
    return "unavailable";
  }

  if (!input.hasManagementConfig || input.errors.length > 0 || input.egressBytes === null || input.apiRequestsCount === null) {
    return "partial";
  }

  return "live";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

async function safeReadResponseText(response: Response) {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

function extractProjectMetrics(payload: unknown) {
  const databaseDiskUsedBytes = findFirstNumeric(payload, [
    ["database_size"],
    ["database_size_bytes"],
    ["disk_size"],
    ["used_bytes"],
    ["disk", "used_bytes"],
    ["usage", "db_size_bytes"],
    ["usage", "database_size_bytes"]
  ]);
  const databaseDiskTotalBytes = findFirstNumeric(payload, [
    ["database_size_limit"],
    ["database_size_quota"],
    ["disk_size_limit"],
    ["disk", "total_bytes"],
    ["usage", "db_size_quota_bytes"],
    ["usage", "database_size_quota_bytes"]
  ]);
  const egressBytes = findFirstNumeric(payload, [
    ["egress"],
    ["egress_bytes"],
    ["network_egress_bytes"],
    ["usage", "egress_bytes"]
  ]);
  const apiRequestsCount = findFirstNumeric(payload, [
    ["api_requests"],
    ["api_requests_count"],
    ["request_count"],
    ["usage", "api_requests_count"]
  ]);

  return {
    databaseDiskUsedBytes,
    databaseDiskTotalBytes,
    databaseDiskPercent: calculatePercent(databaseDiskUsedBytes, databaseDiskTotalBytes),
    egressBytes,
    apiRequestsCount
  };
}

function findFirstNumeric(payload: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = getValueAtPath(payload, path);
    const parsed = parseNullableInteger(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function getValueAtPath(payload: unknown, path: string[]) {
  let current: unknown = payload;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
