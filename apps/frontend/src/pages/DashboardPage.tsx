import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { recordSalesShareLinkAudit } from "../api/crm";
import { Card } from "../components/Card";
import { Toast } from "../components/Toast";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { useRoleDashboard } from "../hooks/useDashboard";
import { getStoredUser } from "../lib/auth";
import type { DashboardMetric } from "../types/dashboard";

export function DashboardPage() {
  const user = getStoredUser();
  const { data, isLoading } = useRoleDashboard();
  const { toast: copyToast, copyText } = useCopyFeedback();

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
    <section className="space-y-6">
      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Dashboard</p>
        <h2 className="mt-3 section-title">{title}</h2>
        <p className="mt-2 section-copy">Role-scoped metrics surface the right operating view without leaking cross-tenant data.</p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {(isLoading ? Array.from({ length: 4 }, () => null as DashboardMetric | null) : data?.metrics ?? []).map((metric, index) => (
          <motion.div key={metric?.label ?? index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 + index * 0.04 }}>
            <Card elevated className="min-h-[160px]">
              {metric ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">{metric.label}</p>
                  <p className="mt-4 text-4xl font-semibold tracking-tight text-text">{metric.value}</p>
                  <p className="mt-3 text-sm leading-6 text-text-muted">{metric.hint}</p>
                </>
              ) : (
                <div className="h-full animate-pulse rounded-xl bg-background-tint" />
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      {data?.sales ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr),380px]">
          <Card elevated>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">{data.sales.title}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {data.sales.stats.map((metric) => (
                metric.href ? (
                  <div key={metric.label} className="rounded-2xl border border-border bg-background-tint p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white">
                    <Link to={appendSalesSection(metric.href, "timeline")}>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{metric.label}</p>
                      <p className="mt-3 text-2xl font-semibold text-text">{metric.value}</p>
                      <p className="mt-2 text-sm leading-6 text-text-muted">{metric.hint}</p>
                    </Link>
                    <div className="mt-3">
                      <button
                        type="button"
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
                  <div key={metric.label} className="rounded-2xl border border-border bg-background-tint p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{metric.label}</p>
                    <p className="mt-3 text-2xl font-semibold text-text">{metric.value}</p>
                    <p className="mt-2 text-sm leading-6 text-text-muted">{metric.hint}</p>
                  </div>
                )
              ))}
            </div>
          </Card>

          <Card elevated>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Pipeline</p>
            <div className="mt-5 space-y-3">
              {data.sales.pipeline.map((stage) => (
                <div
                  key={stage.status}
                  className="block rounded-2xl border border-border bg-background-tint p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white"
                >
                  <Link to={appendSalesSection(stage.href ?? "/sales", "timeline")}>
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-text">{formatPipelineStatus(stage.status)}</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPipelineTone(stage.status)}`}>
                        {stage.count} orders
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-muted">{formatCurrencyValue(stage.value)}</p>
                  </Link>
                  <div className="mt-3">
                    <button
                      type="button"
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
          </Card>
        </div>
      ) : null}

      {data?.sales?.trends?.length ? (
        <Card elevated>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Trend Drill-Down</p>
              <h3 className="mt-2 text-lg font-semibold text-text">Recent daily buckets</h3>
            </div>
            <p className="text-sm text-text-muted">Click a bucket to open matching orders</p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.sales.trends.map((point) => (
              <div
                key={`${point.metric}-${point.range_start}`}
                className="rounded-2xl border border-border bg-background-tint p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white"
              >
                <Link to={appendSalesSection(point.href ?? "/sales", "timeline")}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">
                    {point.metric === "won_revenue" ? "Won revenue" : "Created orders"}
                  </p>
                  <p className="mt-2 text-base font-semibold text-text">{point.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-text">{String(point.value)}</p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {formatTrendRange(point.range_start, point.range_end)}
                  </p>
                </Link>
                <div className="mt-3">
                  <button
                    type="button"
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
        </Card>
      ) : null}
      <Toast message={copyToast?.message ?? null} variant={copyToast?.variant} />
    </section>
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

function formatCurrencyValue(value: string) {
  const amount = Number(value);

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
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
