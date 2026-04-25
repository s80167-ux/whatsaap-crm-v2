import { motion } from "framer-motion";
import { AlertCircle, ChevronDown, Medal, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { recordSalesShareLinkAudit } from "../api/crm";
import styles from "./dashboardPage.module.css";

// Helper to map width percent to Tailwind width class
function getWidthClass(percent: number) {
  if (percent >= 95) return "w-full";
  if (percent >= 80) return "w-5/6";
  if (percent >= 66) return "w-4/6";
  if (percent >= 50) return "w-1/2";
  if (percent >= 33) return "w-1/3";
  if (percent >= 25) return "w-1/4";
  if (percent >= 12) return "w-1/6";
  if (percent > 0) return "w-1/12";
  return "w-0";
}

// Helper to map color to a set of Tailwind bg classes (customize as needed)
function getDotColorClass(color: string) {
  switch (color) {
    case "#22c55e": return "bg-emerald-500";
    case "#f59e42": return "bg-orange-400";
    case "#ef4444": return "bg-red-500";
    case "#3b82f6": return "bg-blue-500";
    default: return "bg-gray-300";
  }
}
import { Card } from "../components/Card";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { Toast } from "../components/Toast";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { useRoleDashboard } from "../hooks/useDashboard";
import { getStoredUser } from "../lib/auth";
import type { DashboardMetric, DashboardSummary } from "../types/dashboard";

type SalesDashboard = NonNullable<DashboardSummary["sales"]>;
type TrendDay = {
  key: string;
  label: string;
  createdOrders: number;
  wonRevenue: number;
};

export function DashboardPage() {
  const user = getStoredUser();
  const { data, isLoading } = useRoleDashboard();
  const { toast: copyToast, copyText } = useCopyFeedback();
  const canShowSalesPerformance = user?.role === "org_admin" || user?.role === "user";

  const title =
    user?.role === "super_admin"
      ? "Platform dashboard"
      : user?.role === "org_admin" || user?.role === "manager"
        ? "Organization dashboard"
        : "My dashboard";

  async function copyTimelineLink(input: {
    href?: string;
    entityType: "sales_metric" | "sales_pipeline" | "sales_trend";
    entityId: string;
    source: "dashboard_metric_card" | "dashboard_pipeline_card" | "dashboard_trend_bucket";
  }) {
    const { href, entityType, entityId, source } = input;

    if (!href || typeof window === "undefined") {
      return;
    }

    const absoluteUrl = new URL(appendSalesSection(href, "timeline"), window.location.origin).toString();
    const relativeUrl = appendSalesSection(href, "timeline");

    const copied = await copyText({
      text: absoluteUrl,
      label: "Timeline link"
    });

    if (copied) {
      void recordSalesShareLinkAudit({
        entityType,
        entityId,
        section: "timeline",
        source,
        href: relativeUrl
      }).catch(() => undefined);
    }
  }

  return (
    <section className="space-y-4">
      <Card elevated className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Dashboard</p>
            <h2 className="mt-2 section-title">{title}</h2>
          </div>
          <p className="max-w-xl text-xs leading-5 text-text-muted">
            Role-scoped metrics surface the right operating view without leaking cross-tenant data.
          </p>
        </div>
      </Card>

      <div className="metric-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(isLoading ? Array.from({ length: 4 }, () => null as DashboardMetric | null) : data?.metrics ?? []).map((metric, index) => (
          <motion.div key={metric?.label ?? index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 + index * 0.04 }}>
            <Card elevated className="metric-card min-h-[118px] p-4">
              {metric ? (
                <>
                  <p className="pr-10 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">{metric.label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{metric.value}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{metric.hint}</p>
                </>
              ) : (
                <div className="h-full animate-pulse rounded-xl bg-background-tint" />
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      {data?.sales ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr),380px]">
          <CompactSection title={data.sales.title} eyebrow="Sales Overview" defaultOpen>
            <div className="grid gap-3 md:grid-cols-3">
              {data.sales.stats.map((metric) => (
                metric.href ? (
                  <div key={metric.label} className="rounded-2xl border border-border bg-background-tint p-3 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white">
                    <Link to={appendSalesSection(metric.href, "timeline")}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">{metric.label}</p>
                      <p className="mt-2 text-xl font-semibold text-text">{metric.value}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{metric.hint}</p>
                    </Link>
                    <div className="mt-2">
                      <button
                        type="button"
                        title={`Copy timeline link for ${metric.label}`}
                        className="text-xs font-medium text-primary transition hover:opacity-80"
                        onClick={() =>
                          void copyTimelineLink({
                            href: metric.href,
                            entityType: "sales_metric",
                            entityId: metric.label,
                            source: "dashboard_metric_card"
                          })
                        }
                      >
                        Copy timeline link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={metric.label} className="rounded-2xl border border-border bg-background-tint p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">{metric.label}</p>
                    <p className="mt-2 text-xl font-semibold text-text">{metric.value}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{metric.hint}</p>
                  </div>
                )
              ))}
            </div>
          </CompactSection>

          <CompactSection title="Pipeline" eyebrow={`${data.sales.pipeline.length} stages`} defaultOpen>
            <div className="space-y-2">
              {data.sales.pipeline.map((stage) => (
                <div
                  key={stage.status}
                  className="block rounded-2xl border border-border bg-background-tint p-3 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white"
                >
                  <Link to={appendSalesSection(stage.href ?? "/sales", "timeline")}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-text">{formatPipelineStatus(stage.status)}</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPipelineTone(stage.status)}`}>
                        {stage.count} orders
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-text-muted">{formatCurrencyValue(stage.value)}</p>
                  </Link>
                  <div className="mt-2">
                    <button
                      type="button"
                      title={`Copy timeline link for ${formatPipelineStatus(stage.status)}`}
                      className="text-xs font-medium text-primary transition hover:opacity-80"
                      onClick={() =>
                        void copyTimelineLink({
                          href: stage.href ?? "/sales",
                          entityType: "sales_pipeline",
                          entityId: stage.status,
                          source: "dashboard_pipeline_card"
                        })
                      }
                    >
                      Copy timeline link
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CompactSection>
        </div>
      ) : null}

      {data?.sales ? <DashboardAnalytics sales={data.sales} showPerformance={canShowSalesPerformance} /> : null}

      {data?.sales?.trends?.length ? (
        <CompactSection title="Recent daily buckets" eyebrow="Trend Drill-Down" summary="Click a bucket to open matching orders">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.sales.trends.map((point) => (
              <div
                key={`${point.metric}-${point.range_start}`}
                className="rounded-2xl border border-border bg-background-tint p-3 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white"
              >
                <Link to={appendSalesSection(point.href ?? "/sales", "timeline")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">
                    {point.metric === "won_revenue" ? "Won revenue" : "Created orders"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-text">{point.label}</p>
                  <p className="mt-2 text-xl font-semibold text-text">{String(point.value)}</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {formatTrendRange(point.range_start, point.range_end)}
                  </p>
                </Link>
                <div className="mt-2">
                  <button
                    type="button"
                    title={`Copy timeline link for ${point.label}`}
                    className="text-xs font-medium text-primary transition hover:opacity-80"
                    onClick={() =>
                      void copyTimelineLink({
                        href: point.href ?? "/sales",
                        entityType: "sales_trend",
                        entityId: `${point.metric}:${point.range_start}`,
                        source: "dashboard_trend_bucket"
                      })
                    }
                  >
                    Copy timeline link
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CompactSection>
      ) : null}

      <Toast message={copyToast?.message ?? null} variant={copyToast?.variant} />
    </section>
  );
}

function CompactSection({
  title,
  eyebrow,
  summary,
  children,
  defaultOpen = false
}: {
  title: string;
  eyebrow?: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Card elevated className="p-0">
      <details className="group" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 marker:hidden">
          <div className="min-w-0">
            {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-soft">{eyebrow}</p> : null}
            <h3 className="mt-1 truncate text-base font-semibold text-text">{title}</h3>
            {summary ? <p className="mt-1 text-xs text-text-muted">{summary}</p> : null}
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background-tint text-text-muted transition group-open:rotate-180">
            <ChevronDown size={16} />
          </span>
        </summary>
        <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
      </details>
    </Card>
  );
}

function DashboardAnalytics({ sales, showPerformance }: { sales: SalesDashboard; showPerformance: boolean }) {
  const trendDays = buildTrendDays(sales.trends ?? []);
  const pipelineTotal = sales.pipeline.reduce((total, stage) => total + stage.count, 0);
  const wonStage = sales.pipeline.find((stage) => stage.status === "closed_won");
  const openStage = sales.pipeline.find((stage) => stage.status === "open");
  const wonCount = wonStage?.count ?? 0;
  const wonValue = parseNumericValue(wonStage?.value ?? 0);
  const openValue = parseNumericValue(openStage?.value ?? 0);
  const conversionRate = pipelineTotal > 0 ? Math.round((wonCount / pipelineTotal) * 100) : 0;
  const averageWon = wonCount > 0 ? wonValue / wonCount : 0;

  return (
    <div className="space-y-4">
      {showPerformance ? (
        <div className="grid gap-3 md:grid-cols-3">
          <InsightTile label="Conversion rate" value={`${conversionRate}%`} hint="Closed-won orders divided by all pipeline orders" />
          <InsightTile label="Average won order" value={formatCompactCurrency(averageWon)} hint="Revenue quality across converted orders" />
          <InsightTile label="Open pipeline value" value={formatCompactCurrency(openValue)} hint="Potential revenue still being worked" />
        </div>
      ) : null}

      {showPerformance ? (
        <TeamPerformanceAnalysis
          leaders={sales.leaderboard ?? []}
          needsAttention={sales.leaderboard_attention ?? []}
          averageWonCount={sales.leaderboard_average_won_count ?? 0}
        />
      ) : null}

      <DashboardGraphPanel sales={sales} trendDays={trendDays} showPerformance={showPerformance} />

      {!showPerformance ? (
        <div className="grid gap-3 md:grid-cols-3">
          <InsightTile label="Conversion rate" value={`${conversionRate}%`} hint="Closed-won orders divided by all pipeline orders" />
          <InsightTile label="Average won order" value={formatCompactCurrency(averageWon)} hint="Revenue quality across converted orders" />
          <InsightTile label="Open pipeline value" value={formatCompactCurrency(openValue)} hint="Potential revenue still being worked" />
        </div>
      ) : null}
    </div>
  );
}

function DashboardGraphPanel({
  sales,
  trendDays,
  showPerformance
}: {
  sales: SalesDashboard;
  trendDays: TrendDay[];
  showPerformance: boolean;
}) {
  const pipelineTotal = sales.pipeline.reduce((total, stage) => total + stage.count, 0);
  const maxPipelineCount = Math.max(...sales.pipeline.map((stage) => stage.count), 1);
  const maxPipelineValue = Math.max(...sales.pipeline.map((stage) => parseNumericValue(stage.value)), 1);
  const maxCreated = Math.max(...trendDays.map((day) => day.createdOrders), 1);
  const maxWon = Math.max(...trendDays.map((day) => day.wonRevenue), 1);
  const latest = trendDays[trendDays.length - 1];
  const createdPath = buildSparklinePoints(trendDays.map((day) => day.createdOrders), maxCreated);
  const wonPath = buildSparklinePoints(trendDays.map((day) => day.wonRevenue), maxWon);
  const donutSegments = buildDonutSegments(sales.pipeline, pipelineTotal);
  const orderedStages = [...sales.pipeline].sort((left, right) => getPipelineOrder(left.status) - getPipelineOrder(right.status));
  const rankedLeaders = [...(sales.leaderboard ?? [])]
    .sort((left, right) => {
      const rightRate = right.order_count > 0 ? right.won_count / right.order_count : 0;
      const leftRate = left.order_count > 0 ? left.won_count / left.order_count : 0;

      return rightRate - leftRate;
    });
  const teamWinRatePagination = usePanelPagination(rankedLeaders);

  return (
    <CompactSection title="Analysis panel" eyebrow="Compact Graphs" summary="Trends, stage mix, funnel, value, and team win rate in one view" defaultOpen>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr),minmax(320px,0.85fr)]">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-background-tint to-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-text">Orders and won revenue</p>
              <p className="text-xs text-text-muted">Seven-day trend</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <MetricPill label="created" value={String(latest?.createdOrders ?? 0)} />
              <MetricPill label="won" value={formatCompactCurrency(latest?.wonRevenue ?? 0)} />
            </div>
          </div>
          <svg viewBox="0 0 100 38" role="img" aria-label="Orders and won revenue sparkline" className="mt-3 h-24 w-full overflow-visible">
            <polyline points={createdPath} fill="none" stroke="rgba(0, 87, 168, 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={wonPath} fill="none" stroke="rgba(16, 185, 129, 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            {trendDays.map((day, index) => {
              const x = getSparklineX(index, trendDays.length);

              return (
                <g key={day.key}>
                  <circle cx={x} cy={getSparklineY(day.createdOrders, maxCreated)} r="1.5" fill="#0057A8">
                    <title>{`${day.label}: ${day.createdOrders} created orders`}</title>
                  </circle>
                  <circle cx={x} cy={getSparklineY(day.wonRevenue, maxWon)} r="1.5" fill="#10B981">
                    <title>{`${day.label}: ${formatCompactCurrency(day.wonRevenue)} won revenue`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Created</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Won MYR</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-3">
          <div className="grid items-center gap-3 sm:grid-cols-[116px,minmax(0,1fr)]">
            <div className="relative mx-auto h-28 w-28">
              <svg viewBox="0 0 120 120" role="img" aria-label="Pipeline order stage share donut" className="h-full w-full rotate-[-90deg]">
                <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(224, 232, 242, 0.9)" strokeWidth="18" />
                {donutSegments.map((segment) => (
                  <circle
                    key={segment.status}
                    cx="60"
                    cy="60"
                    r="42"
                    fill="none"
                    stroke={segment.color}
                    strokeDasharray={`${segment.length} ${segment.gap}`}
                    strokeDashoffset={segment.offset}
                    strokeLinecap="round"
                    strokeWidth="18"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="text-2xl font-semibold tracking-tight text-text">{pipelineTotal}</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-soft">Orders</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-text">Order stage share</p>
              {sales.pipeline.map((stage) => {
                const percent = pipelineTotal > 0 ? Math.round((stage.count / pipelineTotal) * 100) : 0;

                return (
                  <div key={stage.status} className="flex items-center justify-between gap-2 rounded-xl bg-background-tint px-3 py-1.5">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-text">
                      <span
                        className={`h-2 w-2 rounded-full ${getDotColorClass(getPipelineGraphColor(stage.status))}`}
                      />
                      {formatPipelineStatus(stage.status)}
                    </span>
                    <span className="text-xs font-semibold text-text">{percent}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-3">
          <p className="text-sm font-semibold text-text">Conversion funnel</p>
          <div className="mt-3 space-y-2">
            {orderedStages.map((stage) => {
              const width = Math.max((stage.count / maxPipelineCount) * 100, stage.count > 0 ? 12 : 4);
              const share = pipelineTotal > 0 ? Math.round((stage.count / pipelineTotal) * 100) : 0;

              return (
                <div key={stage.status}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-text">{formatPipelineStatus(stage.status)}</span>
                    <span className="text-text-muted">{stage.count} orders, {share}%</span>
                  </div>
                  <div className="h-6 overflow-hidden rounded-full bg-background-tint">
                    <div
                      className={`h-full rounded-full ${getPipelineBarTone(stage.status)} ${getWidthClass(width)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-3">
          <p className="text-sm font-semibold text-text">Pipeline value mix</p>
          <div className="mt-3 space-y-2">
            {sales.pipeline.map((stage) => {
              const value = parseNumericValue(stage.value);
              const width = Math.max((value / maxPipelineValue) * 100, value > 0 ? 10 : 3);

              return (
                <div key={stage.status}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-text">{formatPipelineStatus(stage.status)}</span>
                    <span className="font-semibold text-text">{formatCompactCurrency(value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-background-tint">
                    <div
                      className={`h-full rounded-full ${getPipelineBarTone(stage.status)} ${getWidthClass(width)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-3">
          <p className="text-sm font-semibold text-text">Team win rate</p>
          {showPerformance && rankedLeaders.length ? (
            <div className="mt-3 space-y-2">
              {teamWinRatePagination.visibleItems.map((leader) => {
                const winRate = leader.order_count > 0 ? Math.round((leader.won_count / leader.order_count) * 100) : 0;

                return (
                  <div key={leader.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-text">{leader.name}</span>
                      <span className="font-semibold text-text">{winRate}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-background-tint">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 ${getWidthClass(Math.max(winRate, winRate > 0 ? 8 : 2))}`}
                      />
                    </div>
                  </div>
                );
              })}
              <PanelPagination
                page={teamWinRatePagination.page}
                pageCount={teamWinRatePagination.pageCount}
                totalItems={teamWinRatePagination.totalItems}
                onPageChange={teamWinRatePagination.setPage}
              />
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-background-tint p-3 text-xs leading-5 text-text-muted">
              Win-rate graph appears after orders are assigned.
            </div>
          )}
        </div>
      </div>
    </CompactSection>
  );
}

function PipelineDonutGraph({ pipeline }: { pipeline: SalesDashboard["pipeline"] }) {
  const totalCount = pipeline.reduce((total, stage) => total + stage.count, 0);
  const segments = buildDonutSegments(pipeline, totalCount);
  const largestStage = [...pipeline].sort((left, right) => right.count - left.count)[0];

  return (
    <CompactSection title="Order stage share" eyebrow="Analysis Graph" summary="Pipeline order distribution" defaultOpen>
      <div className="grid items-center gap-5 sm:grid-cols-[170px,minmax(0,1fr)]">
        <div className="relative mx-auto h-40 w-40">
          <svg viewBox="0 0 120 120" role="img" aria-label="Pipeline order stage share donut" className="h-full w-full rotate-[-90deg]">
            <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(224, 232, 242, 0.9)" strokeWidth="18" />
            {segments.map((segment) => (
              <circle
                key={segment.status}
                cx="60"
                cy="60"
                r="42"
                fill="none"
                stroke={segment.color}
                strokeDasharray={`${segment.length} ${segment.gap}`}
                strokeDashoffset={segment.offset}
                strokeLinecap="round"
                strokeWidth="18"
              >
                <title>{`${formatPipelineStatus(segment.status)}: ${segment.count} orders`}</title>
              </circle>
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full text-center">
            <p className="text-3xl font-semibold tracking-tight text-text">{totalCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-soft">Orders</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm leading-6 text-text-muted">
            {largestStage ? `${formatPipelineStatus(largestStage.status)} currently holds the largest order share.` : "No pipeline orders yet."}
          </p>
          {pipeline.map((stage) => {
            const percent = totalCount > 0 ? Math.round((stage.count / totalCount) * 100) : 0;

            return (
              <div key={stage.status} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background-tint px-3 py-2">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-text">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${getDotColorClass(getPipelineGraphColor(stage.status))}`}
                  />
                  {formatPipelineStatus(stage.status)}
                </span>
                <span className="text-sm font-semibold text-text">{percent}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </CompactSection>
  );
}

function PipelineFunnelGraph({ pipeline }: { pipeline: SalesDashboard["pipeline"] }) {
  const totalCount = pipeline.reduce((total, stage) => total + stage.count, 0);
  const maxCount = Math.max(...pipeline.map((stage) => stage.count), 1);
  const orderedStages = [...pipeline].sort((left, right) => getPipelineOrder(left.status) - getPipelineOrder(right.status));

  return (
    <CompactSection title="Pipeline conversion funnel" eyebrow="Analysis Graph" summary="Count and value by stage" defaultOpen>
      <div className="space-y-3">
        {orderedStages.map((stage) => {
          const width = Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 12 : 4);
          const share = totalCount > 0 ? Math.round((stage.count / totalCount) * 100) : 0;

          return (
            <div key={stage.status} className="rounded-2xl border border-border bg-white p-3 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text">{formatPipelineStatus(stage.status)}</p>
                  <p className="text-xs text-text-muted">{stage.count} orders - {share}% of total</p>
                </div>
                <p className="text-sm font-semibold text-text">{formatCompactCurrency(parseNumericValue(stage.value))}</p>
              </div>
              <div className="mt-3 h-9 overflow-hidden rounded-full bg-background-tint">
                <div
                  className={`flex h-full items-center justify-end rounded-full px-3 text-xs font-semibold text-white ${getPipelineBarTone(stage.status)}`}
                  
                >
                  {stage.count}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </CompactSection>
  );
}

function TeamWinRateGraph({ leaders }: { leaders: NonNullable<SalesDashboard["leaderboard"]> }) {
  const rankedLeaders = [...leaders]
    .sort((left, right) => {
      const rightRate = right.order_count > 0 ? right.won_count / right.order_count : 0;
      const leftRate = left.order_count > 0 ? left.won_count / left.order_count : 0;

      return rightRate - leftRate;
    });
  const leaderPagination = usePanelPagination(rankedLeaders);

  return (
    <CompactSection title="Team win-rate graph" eyebrow="Performance Graph" summary="Closed-won rate by assignee">
      {rankedLeaders.length ? (
        <div className="space-y-3">
          {leaderPagination.visibleItems.map((leader, index) => {
            const winRate = leader.order_count > 0 ? Math.round((leader.won_count / leader.order_count) * 100) : 0;
            const rank = (leaderPagination.page - 1) * leaderPagination.pageSize + index;

            return (
              <div key={leader.id} className="grid gap-2 rounded-2xl border border-border bg-background-tint p-3 sm:grid-cols-[160px,minmax(0,1fr),72px] sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-none border text-xs font-bold ${getRankTone(rank)}`}>
                    {rank + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">{leader.name}</p>
                    <p className="text-xs text-text-muted">{leader.won_count}/{leader.order_count} won</p>
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 ${getWidthClass(Math.max(winRate, winRate > 0 ? 8 : 2))}`}
                  />
                </div>
                <p className="text-right text-lg font-semibold text-text">{winRate}%</p>
              </div>
            );
          })}
          <PanelPagination
            page={leaderPagination.page}
            pageCount={leaderPagination.pageCount}
            totalItems={leaderPagination.totalItems}
            onPageChange={leaderPagination.setPage}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-background-tint p-5 text-sm leading-6 text-text-muted">
          Win-rate graph will appear after orders are assigned to team members.
        </div>
      )}
    </CompactSection>
  );
}

function PerformanceGraph({ trendDays }: { trendDays: TrendDay[] }) {
  const maxCreated = Math.max(...trendDays.map((day) => day.createdOrders), 1);
  const maxWon = Math.max(...trendDays.map((day) => day.wonRevenue), 1);
  const latest = trendDays[trendDays.length - 1];
  const createdPath = buildSparklinePoints(trendDays.map((day) => day.createdOrders), maxCreated);
  const wonPath = buildSparklinePoints(trendDays.map((day) => day.wonRevenue), maxWon);

  return (
    <CompactSection title="Orders and won revenue" eyebrow="Performance Graph" summary="Compact seven-day trend" defaultOpen>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <MetricPill label="Latest created" value={String(latest?.createdOrders ?? 0)} />
          <MetricPill label="Latest won" value={formatCompactCurrency(latest?.wonRevenue ?? 0)} />
        </div>
        <div className="flex gap-3 text-xs font-medium text-text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Created</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Won MYR</span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-gradient-to-br from-background-tint to-white p-3">
        <svg viewBox="0 0 100 44" role="img" aria-label="Orders and won revenue sparkline" className="h-28 w-full overflow-visible">
          <polyline points={createdPath} fill="none" stroke="rgba(0, 87, 168, 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={wonPath} fill="none" stroke="rgba(16, 185, 129, 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {trendDays.map((day, index) => {
            const x = getSparklineX(index, trendDays.length);
            const createdY = getSparklineY(day.createdOrders, maxCreated);
            const wonY = getSparklineY(day.wonRevenue, maxWon);

            return (
              <g key={day.key}>
                <circle cx={x} cy={createdY} r="1.5" fill="#0057A8">
                  <title>{`${day.label}: ${day.createdOrders} created orders`}</title>
                </circle>
                <circle cx={x} cy={wonY} r="1.5" fill="#10B981">
                  <title>{`${day.label}: ${formatCompactCurrency(day.wonRevenue)} won revenue`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {trendDays.slice(-4).map((day) => (
            <div key={day.key} className="rounded-xl bg-white px-3 py-2 text-xs shadow-soft">
              <p className="font-semibold text-text">{day.label}</p>
              <p className="mt-1 text-text-muted">{day.createdOrders} / {formatCompactCurrency(day.wonRevenue)}</p>
            </div>
          ))}
        </div>
      </div>
    </CompactSection>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border bg-background-tint px-3 py-1 text-xs text-text-muted">
      <span className="font-semibold text-text">{value}</span> {label}
    </span>
  );
}

function PipelineAnalysis({ pipeline }: { pipeline: SalesDashboard["pipeline"] }) {
  const maxValue = Math.max(...pipeline.map((stage) => parseNumericValue(stage.value)), 1);
  const totalCount = pipeline.reduce((total, stage) => total + stage.count, 0);

  return (
    <CompactSection title="Pipeline value mix" eyebrow="Analysis Graph" summary={`${totalCount} total orders`}>
      <div className="space-y-3">
        {pipeline.map((stage) => {
          const value = parseNumericValue(stage.value);
          const percent = Math.round((value / maxValue) * 100);

          return (
            <div key={stage.status}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text">{formatPipelineStatus(stage.status)}</p>
                  <p className="text-xs text-text-muted">{stage.count} orders</p>
                </div>
                <p className="text-sm font-semibold text-text">{formatCompactCurrency(value)}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background-tint">
                <div
                  className={`h-full rounded-full ${getPipelineBarTone(stage.status)} ${getWidthClass(Math.max(percent, value > 0 ? 8 : 2))}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </CompactSection>
  );
}

function TeamPerformanceAnalysis({
  leaders,
  needsAttention,
  averageWonCount
}: {
  leaders: NonNullable<SalesDashboard["leaderboard"]>;
  needsAttention: NonNullable<SalesDashboard["leaderboard_attention"]>;
  averageWonCount: number;
}) {
  const fallbackAttention = needsAttention.length
    ? needsAttention
    : [...leaders]
        .filter((leader) => leader.won_count < averageWonCount)
        .sort((left, right) => left.won_count - right.won_count);

  return (
    <CompactSection title="Team Performance Analysis" eyebrow="Coaching View">
      <div className="grid gap-4 xl:grid-cols-2">
        <PerformancePanel
          title="Top Performers"
          subtitle="Highest closed sales and conversion rates"
          badge={`Avg: ${formatDecimal(averageWonCount)} Sales`}
          tone="success"
          icon={<Trophy size={20} />}
          emptyText="No assigned sales orders yet. Once orders are assigned and closed, top performers will appear here."
          rows={leaders}
        />
        <PerformancePanel
          title="Needs Attention"
          subtitle="Below team average performance"
          badge="Gap Analysis"
          tone="danger"
          icon={<AlertCircle size={20} />}
          emptyText="No team members are currently below the team sales average."
          rows={fallbackAttention}
          averageWonCount={averageWonCount}
        />
      </div>
    </CompactSection>
  );
}

function PerformancePanel({
  title,
  subtitle,
  badge,
  tone,
  icon,
  rows,
  emptyText,
  averageWonCount
}: {
  title: string;
  subtitle: string;
  badge: string;
  tone: "success" | "danger";
  icon: ReactNode;
  rows: NonNullable<SalesDashboard["leaderboard"]>;
  emptyText: string;
  averageWonCount?: number;
}) {
  const isSuccess = tone === "success";
  const rowPagination = usePanelPagination(rows);

  return (
    <Card elevated className="overflow-hidden p-0">
      <div className={`h-1.5 ${isSuccess ? "bg-gradient-to-r from-amber-400 via-accent to-emerald-500" : "bg-gradient-to-r from-rose-500 via-coral to-amber-400"}`} />
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={isSuccess ? "mt-1 text-amber-500" : "mt-1 text-coral"}>{icon}</span>
            <div>
              <h4 className="text-base font-semibold tracking-tight text-text">{title}</h4>
              <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
            </div>
          </div>
          <span className={`rounded-none border px-3 py-1 text-xs font-semibold ${isSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {badge}
          </span>
        </div>

        <div className="mt-3 divide-y divide-border/60">
          {rows.length ? rowPagination.visibleItems.map((leader, index) => (
            <PerformanceRow
              key={leader.id}
              leader={leader}
              index={(rowPagination.page - 1) * rowPagination.pageSize + index}
              tone={tone}
              averageWonCount={averageWonCount}
            />
          )) : (
            <div className="rounded-2xl border border-dashed border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">{emptyText}</div>
          )}
        </div>
        <PanelPagination
          className="mt-3"
          page={rowPagination.page}
          pageCount={rowPagination.pageCount}
          totalItems={rowPagination.totalItems}
          onPageChange={rowPagination.setPage}
        />
      </div>
    </Card>
  );
}

function PerformanceRow({
  leader,
  index,
  tone,
  averageWonCount
}: {
  leader: NonNullable<SalesDashboard["leaderboard"]>[number];
  index: number;
  tone: "success" | "danger";
  averageWonCount?: number;
}) {
  const isSuccess = tone === "success";
  const conversionRate = leader.order_count > 0 ? (leader.won_count / leader.order_count) * 100 : 0;
  const salesGap = typeof averageWonCount === "number" ? leader.won_count - averageWonCount : 0;

  return (
    <div className="grid grid-cols-[auto,auto,minmax(0,1fr),auto] items-center gap-3 py-3">
      <span className={`flex h-8 w-8 items-center justify-center rounded-none border text-xs font-bold ${isSuccess ? getRankTone(index) : "border-rose-100 bg-rose-50 text-rose-700"}`}>
        {isSuccess && index < 3 ? <Medal size={18} /> : isSuccess ? `${index + 1}` : (
          <span className="text-center text-[10px] leading-tight">
            <span className="block">{index + 1}{getOrdinalSuffix(index + 1)}</span>
            <span className="block">Last</span>
          </span>
        )}
      </span>
      <span className={`flex h-8 min-w-8 items-center justify-center rounded-none px-2 text-[11px] font-bold uppercase ${isSuccess ? "bg-background-tint text-primary" : "bg-rose-50 text-rose-700"}`}>
        {getInitials(leader.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{leader.name}</p>
        <p className={`mt-1 text-xs ${isSuccess ? "text-emerald-600" : "text-rose-600"}`}>
          {isSuccess ? `UP ${formatDecimal(conversionRate)}% conversion` : `DOWN ${formatSignedDecimal(salesGap)} below avg`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xl font-semibold leading-none text-text">{leader.won_count}</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-soft">Sales</p>
      </div>
    </div>
  );
}

function Leaderboard({ leaders }: { leaders: NonNullable<SalesDashboard["leaderboard"]> }) {
  const maxWonValue = Math.max(...leaders.map((leader) => parseNumericValue(leader.won_value)), 1);
  const leaderPagination = usePanelPagination(leaders);

  return (
    <Card elevated>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Leader Board</p>
        <h3 className="mt-2 text-lg font-semibold text-text">Top performers</h3>
      </div>

      <div className="mt-5 space-y-3">
        {leaders.length ? leaderPagination.visibleItems.map((leader, index) => {
          const wonValue = parseNumericValue(leader.won_value);
          const rank = (leaderPagination.page - 1) * leaderPagination.pageSize + index + 1;

          return (
            <div key={leader.id} className="rounded-2xl border border-border bg-background-tint p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-primary shadow-soft">
                    {rank}
                  </span>
                  <div>
                    <p className="font-semibold text-text">{leader.name}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-text-soft">{formatRole(leader.role)} - {leader.won_count} won</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-text">{formatCompactCurrency(wonValue)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full bg-primary ${getWidthClass(Math.max((wonValue / maxWonValue) * 100, wonValue > 0 ? 8 : 2))}`}
                />
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-border bg-background-tint p-5 text-sm leading-6 text-text-muted">
            No assigned sales orders yet. Once orders are assigned and closed, top performers will appear here.
          </div>
        )}
      </div>
      <PanelPagination
        className="mt-4"
        page={leaderPagination.page}
        pageCount={leaderPagination.pageCount}
        totalItems={leaderPagination.totalItems}
        onPageChange={leaderPagination.setPage}
      />
    </Card>
  );
}

function InsightTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card elevated className="min-h-[110px] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{value}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{hint}</p>
    </Card>
  );
}

function formatPipelineStatus(status: string) {
  switch (status) {
    case "closed_won":
      return "Closed won";
    case "closed_lost":
      return "Closed lost";
    default:
      return "Open";
  }
}

function getPipelineTone(status: string) {
  switch (status) {
    case "closed_won":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "closed_lost":
      return "border-coral/20 bg-coral/10 text-coral";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function getPipelineBarTone(status: string) {
  switch (status) {
    case "closed_won":
      return "bg-emerald-500";
    case "closed_lost":
      return "bg-coral";
    default:
      return "bg-amber-500";
  }
}

function getPipelineGraphColor(status: string) {
  switch (status) {
    case "closed_won":
      return "#10B981";
    case "closed_lost":
      return "#F86F5B";
    default:
      return "#F59E0B";
  }
}

function getPipelineOrder(status: string) {
  switch (status) {
    case "open":
      return 0;
    case "closed_won":
      return 1;
    case "closed_lost":
      return 2;
    default:
      return 3;
  }
}

function buildDonutSegments(pipeline: SalesDashboard["pipeline"], totalCount: number) {
  const circumference = 2 * Math.PI * 42;
  let offset = 0;

  return pipeline.map((stage) => {
    const portion = totalCount > 0 ? stage.count / totalCount : 0;
    const length = Math.max(portion * circumference - (portion > 0 ? 4 : 0), 0);
    const segment = {
      status: stage.status,
      count: stage.count,
      color: getPipelineGraphColor(stage.status),
      length,
      gap: circumference - length,
      offset: -offset
    };

    offset += portion * circumference;
    return segment;
  });
}

function buildSparklinePoints(values: number[], maxValue: number) {
  if (values.length === 0) {
    return "";
  }

  return values
    .map((value, index) => `${getSparklineX(index, values.length)},${getSparklineY(value, maxValue)}`)
    .join(" ");
}

function getSparklineX(index: number, total: number) {
  if (total <= 1) {
    return 50;
  }

  return 4 + (index / (total - 1)) * 92;
}

function getSparklineY(value: number, maxValue: number) {
  const safeMax = Math.max(maxValue, 1);
  const normalized = Math.max(Math.min(value / safeMax, 1), 0);

  return 40 - normalized * 32;
}

function formatCurrencyValue(value: string) {
  const amount = parseNumericValue(value);

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? "compact" : "standard"
  }).format(Number.isFinite(value) ? value : 0);
}

function parseNumericValue(value: number | string) {
  if (typeof value === "number") {
    return value;
  }

  const normalized = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(Number.isFinite(value) ? value : 0);
}

function formatSignedDecimal(value: number) {
  const normalized = Number.isFinite(value) ? value : 0;
  return `${normalized > 0 ? "+" : ""}${formatDecimal(normalized)}`;
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "NA";
}

function getOrdinalSuffix(value: number) {
  const tens = value % 100;

  if (tens >= 11 && tens <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function getRankTone(index: number) {
  switch (index) {
    case 0:
      return "border-amber-200 bg-amber-50 text-amber-600";
    case 1:
      return "border-slate-200 bg-slate-50 text-slate-500";
    case 2:
      return "border-orange-200 bg-orange-50 text-orange-600";
    default:
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }
}

function formatRole(role?: string | null) {
  if (!role) {
    return "Sales";
  }

  return role.replace(/_/g, " ");
}

function buildTrendDays(trends: NonNullable<SalesDashboard["trends"]>): TrendDay[] {
  const ranges = new Map<string, TrendDay>();

  for (const point of trends) {
    const key = point.range_start;
    const existing =
      ranges.get(key) ??
      {
        key,
        label: new Date(point.range_start).toLocaleDateString("en-MY", { month: "short", day: "numeric" }),
        createdOrders: 0,
        wonRevenue: 0
      };

    if (point.metric === "created_orders") {
      existing.createdOrders = parseNumericValue(point.value);
    } else {
      existing.wonRevenue = parseNumericValue(point.value);
    }

    ranges.set(key, existing);
  }

  if (ranges.size > 0) {
    return Array.from(ranges.values()).sort((left, right) => left.key.localeCompare(right.key));
  }

  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    return {
      key: date.toISOString(),
      label: date.toLocaleDateString("en-MY", { month: "short", day: "numeric" }),
      createdOrders: 0,
      wonRevenue: 0
    };
  });
}

function formatTrendRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(new Date(end).getTime() - 1);

  return `${startDate.toLocaleDateString("en-MY")} to ${endDate.toLocaleDateString("en-MY")}`;
}

function appendSalesSection(href: string, section: "timeline") {
  const url = new URL(href, "https://local.sales");
  url.searchParams.set("section", section);
  return `${url.pathname}${url.search}`;
}
