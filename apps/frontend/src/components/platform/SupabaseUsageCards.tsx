import { useEffect } from "react";
import { Activity, AlertTriangle, Database, HardDrive, Package2, Server } from "lucide-react";
import { Card } from "../Card";
import { usePlatformSupabaseUsage } from "../../hooks/useDashboard";
import type { PlatformSupabaseUsageSnapshot } from "../../types/dashboard";

type UsageTone = "unknown" | "normal" | "warning" | "critical";

export function SupabaseUsageCards() {
  const { data: summary, isLoading } = usePlatformSupabaseUsage();
  const latest = summary?.latest ?? null;

  useEffect(() => {
    if (import.meta.env.DEV && latest?.errors) {
      console.log("Platform Supabase usage errors", latest.errors);
    }
  }, [latest?.errors]);

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} elevated className="platform-service-tile">
            <p className="text-sm text-text-muted">Loading Supabase usage...</p>
          </Card>
        ))}
      </div>
    );
  }

  if (!latest) {
    return (
      <Card elevated className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text">Supabase usage</h3>
            <p className="mt-1 text-sm text-text-muted">Database and storage usage snapshots collected by the backend worker.</p>
          </div>
          <div className="platform-service-summary text-text-soft">unknown</div>
        </div>
        <div className="mt-4">
          <div className="platform-service-tile">
            <p className="text-sm text-text-muted">No Supabase usage snapshot yet.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card elevated className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text">Supabase usage</h3>
          <p className="mt-1 text-sm text-text-muted">Database and storage usage snapshots collected by the backend worker.</p>
        </div>
        <div className={`platform-service-summary ${getSummaryTextClass(latest.overall_status)}`}>
          {latest.overall_status}
        </div>
      </div>

      {summary?.stale ? (
        <div className="mt-4 platform-service-tile platform-service-tile--warning">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">Snapshot freshness</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-text-soft">Backend worker</p>
            </div>
            <span className="platform-attention-icon">
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">stale</span>
          </div>
          <p className="mt-2 line-clamp-2 min-h-[2rem] text-xs text-text-muted">
            Last collected {formatDateTime(latest.collected_at)}. This snapshot is older than 3 hours.
          </p>
          <p className="mt-2 truncate text-[11px] text-text-soft">Refresh the worker to collect a new snapshot.</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <UsageCard
          icon={<Server size={18} />}
          title="Supabase Status"
          tone={mapStatusTone(latest.overall_status)}
          value={latest.overall_status}
          detail={`Source: ${latest.source_status}`}
          footer={`Last collected ${formatDateTime(latest.collected_at)}`}
        />
        <UsageCard
          icon={<Database size={18} />}
          title="Database Size"
          tone={getUsageTone(toNumber(latest.db_disk_percent))}
          value={formatBytes(latest.db_size_bytes)}
          detail={buildQuotaDetail(latest.db_disk_total_bytes, latest.db_disk_percent)}
        />
        <UsageCard
          icon={<HardDrive size={18} />}
          title="Database Disk"
          tone={getUsageTone(toNumber(latest.db_disk_percent))}
          value={formatBytes(latest.db_disk_used_bytes)}
          detail={buildUsedQuotaDetail(latest.db_disk_used_bytes, latest.db_disk_total_bytes, latest.db_disk_percent)}
        />
        <UsageCard
          icon={<Package2 size={18} />}
          title="Storage Usage"
          tone={getUsageTone(toNumber(latest.storage_percent))}
          value={formatBytes(latest.storage_used_bytes)}
          detail={buildStorageDetail(latest)}
        />
        <UsageCard
          icon={<Activity size={18} />}
          title="Egress"
          tone={getUsageTone(toNumber(latest.egress_percent))}
          value={formatBytes(latest.egress_bytes)}
          detail={buildUsedQuotaDetail(latest.egress_bytes, latest.egress_quota_bytes, latest.egress_percent)}
        />
        <UsageCard
          icon={<Activity size={18} />}
          title="API Requests"
          tone={latest.api_requests_count === null ? "unknown" : "normal"}
          value={formatCount(latest.api_requests_count)}
          detail="Latest snapshot count"
        />
      </div>

      <p className="mt-3 text-xs text-text-soft">
        Last collected {formatDateTime(latest.collected_at)}. Frontend reads only the latest stored backend snapshot.
      </p>
    </Card>
  );
}

function UsageCard({ detail, footer, icon, title, tone, value }: {
  detail: string;
  footer?: string;
  icon: React.ReactNode;
  title: string;
  tone: UsageTone;
  value: string;
}) {
  return (
    <Card elevated className={`platform-service-tile platform-service-tile--${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{title}</p>
        </div>
        <span className="platform-attention-icon">{icon}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xl font-semibold capitalize text-text">{value}</span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-[2rem] text-xs text-text-muted">{detail}</p>
      <p className="mt-2 truncate text-[11px] text-text-soft">{footer ?? " "}</p>
    </Card>
  );
}

function formatBytes(bytes: string | number | null | undefined) {
  const value = toNumber(bytes);
  if (value === null) {
    return "Unavailable";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value;
  let unitIndex = -1;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const decimals = size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatPercent(value: string | number | null | undefined) {
  const numericValue = toNumber(value);
  return numericValue === null ? null : `${numericValue.toFixed(1)}%`;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatCount(value: string | number | null | undefined) {
  const numericValue = toNumber(value);
  return numericValue === null ? "Unavailable" : numericValue.toLocaleString();
}

function getUsageTone(percent: number | null): UsageTone {
  if (percent === null) {
    return "unknown";
  }

  if (percent >= 90) {
    return "critical";
  }

  if (percent >= 70) {
    return "warning";
  }

  return "normal";
}

function mapStatusTone(status: PlatformSupabaseUsageSnapshot["overall_status"]): UsageTone {
  switch (status) {
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "healthy":
      return "normal";
    case "unknown":
    default:
      return "unknown";
  }
}

function getSummaryTextClass(status: PlatformSupabaseUsageSnapshot["overall_status"]) {
  switch (status) {
    case "healthy":
      return "text-success";
    case "warning":
      return "text-warning";
    case "critical":
      return "text-destructive";
    case "unknown":
    default:
      return "text-text-soft";
  }
}

function buildQuotaDetail(quotaBytes: string | number | null | undefined, percent: string | number | null | undefined) {
  const parts = [quotaBytes ? `Quota ${formatBytes(quotaBytes)}` : null, formatPercent(percent)];
  const detail = parts.filter(Boolean).join(" · ");
  return detail || "Quota unavailable";
}

function buildUsedQuotaDetail(
  usedBytes: string | number | null | undefined,
  quotaBytes: string | number | null | undefined,
  percent: string | number | null | undefined
) {
  if (toNumber(usedBytes) === null) {
    return "Unavailable";
  }

  const parts = [quotaBytes ? `of ${formatBytes(quotaBytes)}` : null, formatPercent(percent)];
  const detail = parts.filter(Boolean).join(" · ");
  return detail || "Usage available";
}

function buildStorageDetail(latest: PlatformSupabaseUsageSnapshot) {
  const parts = [
    buildUsedQuotaDetail(latest.storage_used_bytes, latest.storage_quota_bytes, latest.storage_percent),
    toNumber(latest.storage_object_count) === null
      ? null
      : `${formatCount(latest.storage_object_count)} object${toNumber(latest.storage_object_count) === 1 ? "" : "s"}`
  ];

  return parts.filter(Boolean).join(" · ") || "Unavailable";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
