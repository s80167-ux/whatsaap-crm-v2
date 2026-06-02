import { AlertCircle, BarChart3, Filter, PieChart, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "../Card";
import type {
  DashboardAnalytics,
  DashboardBreakdownSegment,
  DashboardDateRangeDays,
  DashboardTrendPoint
} from "../../types/dashboard";

type AnalyticsPanelProps = {
  analytics?: DashboardAnalytics;
  dateRangeDays: DashboardDateRangeDays;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onDateRangeChange: (value: DashboardDateRangeDays) => void;
};

export function DashboardAnalyticsPanel({
  analytics,
  dateRangeDays,
  isLoading,
  isError,
  errorMessage,
  onDateRangeChange
}: AnalyticsPanelProps) {
  const visibleAnalytics = analytics ?? {
    dateRangeDays,
    availableDateRanges: [7, 30, 90]
  };

  return (
    <div className="space-y-4">
      <Card elevated className="workspace-block p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-soft">Analytics View</p>
            <h3 className="mt-1 text-lg font-semibold text-text">Visual dashboard signals</h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">Real scoped activity only, with trends and distributions that respect the current tenant and access scope.</p>
          </div>
          <label className="flex min-w-[11rem] items-center gap-2 rounded-xl border border-border bg-background-tint px-3 py-2 text-sm text-text">
            <Filter size={15} className="text-text-soft" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Range</span>
            <select
              className="ml-auto bg-transparent text-sm font-semibold text-text outline-none"
              value={dateRangeDays}
              onChange={(event) => onDateRangeChange(Number(event.target.value) as DashboardDateRangeDays)}
            >
              {visibleAnalytics.availableDateRanges.map((range) => (
                <option key={range} value={range}>
                  Last {range} days
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {isError ? (
        <ChartStateCard
          icon={<AlertCircle size={18} />}
          title="Analytics unavailable"
          description={errorMessage ?? "Unable to load dashboard analytics right now."}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <TrendChartCard
            title={visibleAnalytics.campaignPerformanceTrend?.title ?? "Campaign Performance Trend"}
            description={visibleAnalytics.campaignPerformanceTrend?.description ?? "Sent and failed campaign activity over time."}
            points={visibleAnalytics.campaignPerformanceTrend?.points ?? []}
            primaryLabel="Sent"
            secondaryLabel="Failed"
            isLoading={isLoading}
          />
          <TrendChartCard
            title={visibleAnalytics.contactGrowthTrend?.title ?? "Contact Growth Trend"}
            description={visibleAnalytics.contactGrowthTrend?.description ?? "New contacts created over time."}
            points={visibleAnalytics.contactGrowthTrend?.points ?? []}
            primaryLabel="Contacts"
            isLoading={isLoading}
          />
          <BreakdownChartCard
            title={visibleAnalytics.conversationStatusBreakdown?.title ?? "Conversation Status Breakdown"}
            description={visibleAnalytics.conversationStatusBreakdown?.description ?? "Current conversation mix."}
            segments={visibleAnalytics.conversationStatusBreakdown?.segments ?? []}
            isLoading={isLoading}
            icon={<PieChart size={18} />}
          />
          <FunnelChartCard
            title={visibleAnalytics.campaignFunnel?.title ?? "Campaign Funnel"}
            description={visibleAnalytics.campaignFunnel?.description ?? "Recipient outcomes by current delivery state."}
            segments={visibleAnalytics.campaignFunnel?.segments ?? []}
            isLoading={isLoading}
          />
          <BreakdownChartCard
            title={visibleAnalytics.followUpHealth?.title ?? "Follow-up Health"}
            description={visibleAnalytics.followUpHealth?.description ?? "Lead progression across follow-up stages."}
            segments={visibleAnalytics.followUpHealth?.segments ?? []}
            isLoading={isLoading}
            icon={<BarChart3 size={18} />}
          />
          <BreakdownChartCard
            title={visibleAnalytics.moduleUsageOverview?.title ?? "Module Usage Overview"}
            description={visibleAnalytics.moduleUsageOverview?.description ?? "Recent activity by module."}
            segments={visibleAnalytics.moduleUsageOverview?.segments ?? []}
            isLoading={isLoading}
            icon={<TrendingUp size={18} />}
          />
        </div>
      )}
    </div>
  );
}

function TrendChartCard({
  title,
  description,
  points,
  primaryLabel,
  secondaryLabel,
  isLoading
}: {
  title: string;
  description: string;
  points: DashboardTrendPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <ChartSkeletonCard />;
  }

  const hasValues = points.some((point) => point.value > 0 || (point.secondaryValue ?? 0) > 0);
  if (!hasValues) {
    return <ChartStateCard icon={<TrendingUp size={18} />} title={title} description="No scoped activity is available for this time range yet." />;
  }

  const maxValue = Math.max(...points.map((point) => Math.max(point.value, point.secondaryValue ?? 0)), 1);
  const primaryPath = buildLinePath(points.map((point) => point.value), maxValue);
  const secondaryPath = secondaryLabel ? buildLinePath(points.map((point) => point.secondaryValue ?? 0), maxValue) : "";
  const latestPoint = points[points.length - 1];

  return (
    <Card elevated className="workspace-block p-4">
      <ChartHeader title={title} description={description} />
      <div className="chart-container">
        <svg viewBox="0 0 100 44" className="h-40 w-full">
          <path d="M4 36 H96" stroke="rgb(var(--border) / 0.6)" strokeWidth="1" fill="none" />
          <path d={buildAreaPath(points.map((point) => point.value), maxValue)} fill="rgb(var(--primary) / 0.08)" stroke="none" />
          {secondaryPath ? <path d={buildAreaPath(points.map((point) => point.secondaryValue ?? 0), maxValue)} fill="rgb(var(--destructive) / 0.06)" stroke="none" /> : null}
          <path d={primaryPath} stroke="rgb(var(--primary) / 0.95)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {secondaryPath ? <path d={secondaryPath} stroke="rgb(var(--destructive) / 0.95)" strokeWidth="2.5" fill="none" strokeLinecap="round" /> : null}
          {points.map((point, index) => (
            <g key={point.key}>
              <circle cx={getChartX(index, points.length)} cy={getChartY(point.value, maxValue)} r="1.8" fill="rgb(var(--primary) / 0.95)" />
              {typeof point.secondaryValue === "number" ? (
                <circle cx={getChartX(index, points.length)} cy={getChartY(point.secondaryValue, maxValue)} r="1.8" fill="rgb(var(--destructive) / 0.95)" />
              ) : null}
            </g>
          ))}
        </svg>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <LegendSwatch color="bg-primary" label={primaryLabel} />
          {secondaryLabel ? <LegendSwatch color="bg-destructive" label={secondaryLabel} /> : null}
          <span className="ml-auto font-medium text-text">{latestPoint?.label ?? "--"}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {points.slice(-3).map((point) => (
          <MetricChip
            key={point.key}
            href={point.href}
            label={point.label}
            value={secondaryLabel ? `${point.value} / ${point.secondaryValue ?? 0}` : String(point.value)}
          />
        ))}
      </div>
    </Card>
  );
}

function BreakdownChartCard({
  title,
  description,
  segments,
  isLoading,
  icon
}: {
  title: string;
  description: string;
  segments: DashboardBreakdownSegment[];
  isLoading: boolean;
  icon: ReactNode;
}) {
  if (isLoading) {
    return <ChartSkeletonCard />;
  }

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) {
    return <ChartStateCard icon={icon} title={title} description="There isn’t enough scoped data to draw this breakdown yet." />;
  }

  const arcs = buildDonutArcs(segments, total);

  return (
    <Card elevated className="workspace-block p-4">
      <ChartHeader title={title} description={description} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[180px,minmax(0,1fr)] lg:items-center">
        <div className="mx-auto">
          <svg viewBox="0 0 120 120" className="h-44 w-44">
            <circle cx="60" cy="60" r="44" fill="none" stroke="rgb(var(--border) / 0.45)" strokeWidth="14" />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="60"
                cy="60"
                r="44"
                fill="none"
                stroke={arc.stroke}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${arc.length} ${arc.gap}`}
                strokeDashoffset={arc.offset}
                transform="rotate(-90 60 60)"
              />
            ))}
            <text x="60" y="56" textAnchor="middle" className="fill-current text-[10px] font-semibold text-text-soft">
              Total
            </text>
            <text x="60" y="72" textAnchor="middle" className="fill-current text-lg font-semibold text-text">
              {total}
            </text>
          </svg>
        </div>
        <div className="space-y-2">
          {segments.map((segment) => {
            const percent = total > 0 ? Math.round((segment.value / total) * 100) : 0;
            return (
              <Link
                key={segment.key}
                to={segment.href ?? "#"}
                className="dashboard-hover flex items-center justify-between gap-3 rounded-lg bg-background-tint px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${getToneDotClass(segment.tone)}`} />
                    <span className="truncate font-medium text-text">{segment.label}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-text">{segment.value}</p>
                  <p className="text-xs text-text-muted">{percent}%</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function FunnelChartCard({
  title,
  description,
  segments,
  isLoading
}: {
  title: string;
  description: string;
  segments: DashboardBreakdownSegment[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <ChartSkeletonCard />;
  }

  const maxValue = Math.max(...segments.map((segment) => segment.value), 0);
  if (maxValue === 0) {
    return <ChartStateCard icon={<BarChart3 size={18} />} title={title} description="No funnel activity is available for the current scope yet." />;
  }

  return (
    <Card elevated className="workspace-block p-4">
      <ChartHeader title={title} description={description} />
      <div className="mt-4 space-y-3">
        {segments.map((segment) => {
          const width = Math.max((segment.value / maxValue) * 100, segment.value > 0 ? 10 : 0);
          return (
            <Link key={segment.key} to={segment.href ?? "#"} className="dashboard-hover block rounded-lg bg-background-tint px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-text">{segment.label}</span>
                <span className="font-semibold text-text">{segment.value}</span>
              </div>
              <div className="progress-track mt-2.5">
                <div className={`progress-fill ${getToneBarClass(segment.tone)}`} style={{ width: `${width}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function ChartHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-soft">Dashboard Chart</p>
      <h4 className="mt-1.5 text-lg font-semibold tracking-tight text-text">{title}</h4>
      <p className="mt-1.5 text-sm leading-6 text-text-muted">{description}</p>
    </div>
  );
}

function MetricChip({ href, label, value }: { href?: string; label: string; value: string }) {
  const content = (
    <div className="dashboard-hover rounded-lg bg-background-tint px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-soft">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text">{value}</p>
    </div>
  );

  return href ? <Link to={href}>{content}</Link> : content;
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function ChartSkeletonCard() {
  return (
    <Card elevated className="flex min-h-[320px] flex-col gap-4">
      <div className="space-y-2">
        <div className="dashboard-skeleton h-3 w-24" />
        <div className="dashboard-skeleton h-5 w-56" />
        <div className="dashboard-skeleton h-4 w-full max-w-xs" />
      </div>
      <div className="dashboard-skeleton flex-1 rounded-xl" />
      <div className="grid grid-cols-3 gap-2">
        <div className="dashboard-skeleton h-14 rounded-lg" />
        <div className="dashboard-skeleton h-14 rounded-lg" />
        <div className="dashboard-skeleton h-14 rounded-lg" />
      </div>
    </Card>
  );
}

function ChartStateCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Card elevated className="dashboard-empty min-h-[320px]">
      <span className="dashboard-empty-icon">{icon}</span>
      <h4 className="mt-4 text-lg font-semibold text-text">{title}</h4>
      <p className="mt-2 max-w-xs text-sm leading-6 text-text-muted">{description}</p>
    </Card>
  );
}

function buildLinePath(values: number[], maxValue: number) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${getChartX(index, values.length)} ${getChartY(value, maxValue)}`)
    .join(" ");
}

function buildAreaPath(values: number[], maxValue: number) {
  if (values.length === 0) return "";
  const linePath = buildLinePath(values, maxValue);
  const lastX = getChartX(values.length - 1, values.length);
  const firstX = getChartX(0, values.length);
  return `${linePath} L ${lastX} 40 L ${firstX} 40 Z`;
}

function getChartX(index: number, total: number) {
  if (total <= 1) {
    return 50;
  }

  return 6 + (index / (total - 1)) * 88;
}

function getChartY(value: number, maxValue: number) {
  const safeMax = Math.max(maxValue, 1);
  const normalized = Math.max(Math.min(value / safeMax, 1), 0);
  return 36 - normalized * 28;
}

function buildDonutArcs(segments: DashboardBreakdownSegment[], total: number) {
  const circumference = 2 * Math.PI * 44;
  let offset = 0;

  return segments.map((segment) => {
    const portion = total > 0 ? segment.value / total : 0;
    const length = Math.max(portion * circumference - (portion > 0 ? 3 : 0), 0);
    const arc = {
      key: segment.key,
      stroke: getToneStroke(segment.tone),
      length,
      gap: circumference - length,
      offset: -offset
    };
    offset += portion * circumference;
    return arc;
  });
}

function getToneDotClass(tone?: DashboardBreakdownSegment["tone"]) {
  switch (tone) {
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "danger":
      return "bg-destructive";
    case "primary":
      return "bg-primary";
    default:
      return "bg-text-soft";
  }
}

function getToneBarClass(tone?: DashboardBreakdownSegment["tone"]) {
  switch (tone) {
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "danger":
      return "bg-destructive";
    case "primary":
      return "bg-primary";
    default:
      return "bg-border";
  }
}

function getToneStroke(tone?: DashboardBreakdownSegment["tone"]) {
  switch (tone) {
    case "success":
      return "rgb(var(--success) / 0.95)";
    case "warning":
      return "rgb(var(--warning) / 0.95)";
    case "danger":
      return "rgb(var(--destructive) / 0.95)";
    case "primary":
      return "rgb(var(--primary) / 0.95)";
    default:
      return "rgb(var(--muted-foreground) / 0.9)";
  }
}
