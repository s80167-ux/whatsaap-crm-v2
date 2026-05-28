import { motion } from "framer-motion";
import { Activity, AlertCircle, ArrowRight, Bot, BriefcaseBusiness, CheckCircle2, ChevronDown, Medal, MessageSquare, ShieldAlert, Sparkles, Target, Trophy, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useOutletContext } from "react-router-dom";
import { recordSalesShareLinkAudit } from "../api/crm";

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

import { Card } from "../components/Card";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { Toast } from "../components/Toast";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { useRoleDashboard } from "../hooks/useDashboard";
import { useIsMobileViewport } from "../hooks/useMediaQuery";
import { getStoredUser } from "../lib/auth";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import type { DashboardMetric, DashboardSummary, DynamicDashboardWidget } from "../types/dashboard";

type SalesDashboard = NonNullable<DashboardSummary["sales"]>;
type StoredUserRole = NonNullable<ReturnType<typeof getStoredUser>>["role"];
type TrendDay = {
  key: string;
  label: string;
  createdOrders: number;
  wonRevenue: number;
};

export function DashboardPage() {
  const { t } = useTranslation();
  const user = getStoredUser();
  const outletContext = useOutletContext<DashboardOutletContext>();
  const isMobile = useIsMobileViewport();
  const selectedOrganizationId = user?.role === "super_admin" ? outletContext.selectedOrganizationId : null;
  const { data, isLoading, isError, error } = useRoleDashboard({ organizationId: selectedOrganizationId });
  const { toast: copyToast, copyText } = useCopyFeedback();
  const canShowSalesPerformance = user?.role === "org_admin" || user?.role === "user";
  const title = titleForRole(user?.role, t);
  const loadingDashboard = buildLoadingDashboard(
    user?.role === "super_admin" && selectedOrganizationId
      ? outletContext.selectedOrganizationName ?? t("dashboard.organization")
      : title
  );
  const visibleDashboard = data ?? (isLoading ? loadingDashboard : null);
  const hasDynamicDashboard = Boolean(visibleDashboard?.summary || visibleDashboard?.widgets || visibleDashboard?.enabledModules);

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
    <section className="dashboard-main-grid dashboard-page">
      {isError ? <DashboardErrorCard message={error instanceof Error ? error.message : "Unable to load dashboard widgets."} /> : null}

      {!isError && hasDynamicDashboard && visibleDashboard ? (
        <DynamicDashboard title={title} dashboard={visibleDashboard} isLoading={isLoading} />
      ) : data?.sales ? (
        <SalesCommandCenter title={title} sales={data.sales} operationalMetrics={data.metrics} isLoading={isLoading} />
      ) : (
        <>
          <Card elevated className="workspace-page-header p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">{t("dashboard.title")}</p>
              <h2 className="mt-3 text-[2rem] font-semibold tracking-tight text-text">{title}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
                {t("dashboard.description")}
              </p>
            </div>
          </Card>

          <div className="metric-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(isLoading ? Array.from({ length: 4 }, () => null as DashboardMetric | null) : data?.metrics ?? []).map((metric, index) => (
              <motion.div key={metric?.label ?? index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 + index * 0.04 }}>
                <DashboardMetricCard metric={metric} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      {!hasDynamicDashboard && data?.sales ? <DashboardAnalytics sales={data.sales} showPerformance={canShowSalesPerformance} /> : null}

      {!hasDynamicDashboard && data?.sales?.trends?.length ? (
        <CompactSection title={t("dashboard.recentDailyBuckets")} eyebrow={t("dashboard.trendDrillDown")} summary={t("dashboard.openMatchingOrders")} defaultOpen={!isMobile}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {data.sales.trends.map((point) => (
              <div
                key={`${point.metric}-${point.range_start}`}
                className="workspace-subtle p-3 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5"
              >
                <Link to={appendSalesSection(point.href ?? "/sales", "timeline")}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft">
                    {point.metric === "won_revenue" ? t("dashboard.wonRevenue") : t("dashboard.createdOrders")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-text">{point.label}</p>
                  <p className="mt-1 text-base font-semibold text-text">{String(point.value)}</p>
                  <p className="mt-0.5 text-xs leading-4 text-text-muted">
                    {formatTrendRange(point.range_start, point.range_end)}
                  </p>
                </Link>
                <div className="mt-1">
                  <button
                    type="button"
                    title={`Copy timeline link for ${point.label}`}
                    className="text-[11px] font-medium text-primary/80 transition hover:text-primary"
                    onClick={() =>
                      void copyTimelineLink({
                        href: point.href ?? "/sales",
                        entityType: "sales_trend",
                        entityId: `${point.metric}:${point.range_start}`,
                        source: "dashboard_trend_bucket"
                      })
                    }
                  >
                    {t("dashboard.copyLink")}
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

function titleForRole(role: StoredUserRole | undefined, translate: (key: string) => string) {
  if (role === "super_admin") {
    return translate("dashboard.platform");
  }

  if (role === "org_admin" || role === "manager") {
    return translate("dashboard.organization");
  }

  return translate("dashboard.mine");
}

function buildLoadingDashboard(title: string): DashboardSummary {
  return {
    scope: "admin",
    generatedAt: new Date().toISOString(),
    enabledModules: [],
    summary: {
      title,
      subtitle: "Loading module-aware dashboard widgets.",
      healthStatus: "unknown",
      activeModuleCount: 0,
      alertCount: 0
    },
    widgets: [],
    metrics: []
  };
}

function DashboardErrorCard({ message }: { message: string }) {
  return (
    <Card elevated className="workspace-block border-destructive/20 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-destructive">Dashboard unavailable</p>
      <h2 className="mt-2 text-xl font-semibold text-text">Unable to load dashboard widgets</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{message}</p>
    </Card>
  );
}

function SalesCommandCenter({
  title,
  sales,
  operationalMetrics,
  isLoading
}: {
  title: string;
  sales: SalesDashboard;
  operationalMetrics: DashboardMetric[];
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const trendDays = buildTrendDays(sales.trends ?? []);
  const latestTrend = trendDays[trendDays.length - 1];
  const previousTrend = trendDays[trendDays.length - 2];
  const openStage = sales.pipeline.find((stage) => stage.status === "open");
  const wonStage = sales.pipeline.find((stage) => stage.status === "closed_won");
  const lostStage = sales.pipeline.find((stage) => stage.status === "closed_lost");
  const pipelineTotal = sales.pipeline.reduce((total, stage) => total + stage.count, 0);
  const openValue = parseNumericValue(openStage?.value ?? 0);
  const wonValue = parseNumericValue(wonStage?.value ?? 0);
  const wonCount = wonStage?.count ?? 0;
  const conversionRate = pipelineTotal > 0 ? Math.round((wonCount / pipelineTotal) * 100) : 0;
  const averageWon = wonCount > 0 ? wonValue / wonCount : 0;
  const activeLeads = findMetric(operationalMetrics, "Active leads") ?? findStat(sales.stats, "Active leads");
  const conversationMetric = findMetric(operationalMetrics, "conversation");
  const topPerformer = sales.leaderboard?.[0];
  const attentionCount = sales.leaderboard_attention?.length ?? 0;
  const createdChange = (latestTrend?.createdOrders ?? 0) - (previousTrend?.createdOrders ?? 0);
  const wonChange = (latestTrend?.wonRevenue ?? 0) - (previousTrend?.wonRevenue ?? 0);
  const brief = buildSalesBrief({
    openValue,
    wonValue,
    conversionRate,
    activeLeadsValue: activeLeads?.value,
    attentionCount,
    latestCreated: latestTrend?.createdOrders ?? 0,
    latestWon: latestTrend?.wonRevenue ?? 0,
    topPerformerName: topPerformer?.name,
    conversationValue: conversationMetric?.value
  });

  return (
    <div className="space-y-4">
      <Card elevated className="overflow-hidden border-primary/20 p-0">
        <div className="bg-gradient-to-r from-primary/12 via-card to-success/10 p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr),minmax(360px,0.75fr)]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  <Target size={14} />
                  {t("dashboard.salesCommand")}
                </span>
                <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                  {sales.title}
                </span>
              </div>
              <h2 className="mt-4 text-[2rem] font-semibold tracking-tight text-text sm:text-4xl">{t("dashboard.todaySalesCommand")}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-text-muted">
                {t("dashboard.salesCommandDescription", { title })}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <HeroMetricCard
                  label={t("dashboard.openPipeline")}
                  value={formatCompactCurrency(openValue)}
                  hint={`${openStage?.count ?? 0} open orders still being worked`}
                  tone="warning"
                  href="/sales?status=open"
                />
                <HeroMetricCard
                  label={t("dashboard.wonRevenue")}
                  value={formatCompactCurrency(wonValue)}
                  hint={`${wonStage?.count ?? 0} closed-won orders`}
                  tone="success"
                  href="/sales?status=closed_won"
                />
                <HeroMetricCard
                  label={t("dashboard.conversion")}
                  value={`${conversionRate}%`}
                  hint="Closed-won orders divided by all pipeline orders"
                  tone="primary"
                  href="/sales"
                />
                <HeroMetricCard
                  label={t("dashboard.avgWonOrder")}
                  value={formatCompactCurrency(averageWon)}
                  hint="Revenue quality across converted orders"
                  tone="neutral"
                  href="/sales?status=closed_won"
                />
              </div>
            </div>

            <div className="workspace-block bg-card/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{t("dashboard.smartSalesBrief")}</p>
                  <h3 className="mt-2 text-lg font-semibold text-text">{t("dashboard.whatMattersNow")}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <Bot size={13} />
                  {t("dashboard.aiReady")}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {brief.map((item) => (
                  <div key={item.title} className="rounded-xl border border-border bg-background-tint px-3 py-2.5">
                    <p className="text-sm font-semibold text-text">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-text-muted">{item.detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <CommandLink to="/sales" label={t("dashboard.pipeline")} icon={<BriefcaseBusiness size={15} />} />
                <CommandLink to="/inbox/whatsapp" label={t("nav.inbox")} icon={<MessageSquare size={15} />} />
                <CommandLink to="/reports" label={t("dashboard.report")} icon={<Sparkles size={15} />} />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),360px]">
        <Card elevated className="workspace-block p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-soft">{t("dashboard.pipelineHealth")}</p>
              <h3 className="mt-1 text-lg font-semibold text-text">{t("dashboard.dealStagePressure")}</h3>
            </div>
            <span className="rounded-full border border-border bg-background-tint px-3 py-1 text-xs font-semibold text-text-muted">
              {t("dashboard.orders", { count: pipelineTotal })}
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {sales.pipeline
              .slice()
              .sort((left, right) => getPipelineOrder(left.status) - getPipelineOrder(right.status))
              .map((stage) => {
                const stageValue = parseNumericValue(stage.value);
                const percent = pipelineTotal > 0 ? Math.round((stage.count / pipelineTotal) * 100) : 0;

                return (
                  <Link
                    key={stage.status}
                    to={appendSalesSection(stage.href ?? "/sales", "timeline")}
                    className="workspace-subtle p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                        <span className={`h-2.5 w-2.5 rounded-full ${getPipelineDotTone(stage.status)}`} />
                        {formatPipelineStatus(stage.status)}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPipelineTone(stage.status)}`}>
                        {percent}%
                      </span>
                    </div>
                    <p className="mt-4 text-2xl font-semibold tracking-tight text-text">{formatCompactCurrency(stageValue)}</p>
                    <p className="mt-1 text-xs text-text-muted">{stage.count} orders</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-background-tint">
                      <div className={`h-full rounded-full ${getPipelineBarTone(stage.status)} ${getWidthClass(Math.max(percent, stage.count > 0 ? 8 : 2))}`} />
                    </div>
                  </Link>
                );
              })}
          </div>
        </Card>

        <Card elevated className="workspace-block p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-soft">{t("dashboard.todaysSignals")}</p>
          <h3 className="mt-1 text-lg font-semibold text-text">{t("dashboard.salesMomentum")}</h3>
          <div className="mt-4 space-y-3">
            <SignalRow label={t("dashboard.createdToday")} value={String(latestTrend?.createdOrders ?? 0)} delta={createdChange} />
            <SignalRow label={t("dashboard.wonToday")} value={formatCompactCurrency(latestTrend?.wonRevenue ?? 0)} delta={wonChange} currency />
            <SignalRow label={t("dashboard.lostOrders")} value={String(lostStage?.count ?? 0)} />
            <SignalRow label={t("dashboard.attentionList")} value={String(attentionCount)} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(isLoading ? Array.from({ length: 4 }, () => null as DashboardMetric | null) : operationalMetrics).slice(0, 4).map((metric, index) => (
          <motion.div key={metric?.label ?? index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 + index * 0.04 }}>
            <DashboardMetricCard metric={metric} compact />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function DynamicDashboard({
  title,
  dashboard,
  isLoading
}: {
  title: string;
  dashboard: DashboardSummary;
  isLoading: boolean;
}) {
  const widgets = (dashboard.widgets ?? []).slice().sort((left, right) => left.priority - right.priority);
  const alerts = widgets.flatMap((widget) => widget.alerts.map((alert) => ({ ...alert, widgetTitle: widget.title })));
  const quickActions = widgets.flatMap((widget) => widget.quickActions).slice(0, 6);
  const enabledModules = dashboard.enabledModules ?? [];
  const todayActivity =
    widgets
      .flatMap((widget) => widget.metrics)
      .find((metric) => metric.label.toLowerCase().includes("today"))?.value ?? 0;

  return (
    <div className="space-y-4">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Dashboard</p>
            <h2 className="mt-3 text-[2rem] font-semibold tracking-tight text-text">{dashboard.summary?.title ?? title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
              {dashboard.summary?.subtitle ?? title}
            </p>
            {enabledModules.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {enabledModules.map((moduleKey) => (
                  <span key={moduleKey} className="rounded-full border border-border bg-background-tint px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                    {formatModuleKey(moduleKey)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <DashboardStatusBadge status={dashboard.summary?.healthStatus ?? "unknown"} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStripCard icon={<Zap size={16} />} label="Active modules" value={String(dashboard.summary?.activeModuleCount ?? widgets.length)} />
        <SummaryStripCard icon={<ShieldAlert size={16} />} label="Alerts" value={String(dashboard.summary?.alertCount ?? alerts.length)} tone={alerts.length ? "warning" : "success"} />
        <SummaryStripCard icon={<Activity size={16} />} label="Today activity" value={String(todayActivity)} />
        <SummaryStripCard icon={<CheckCircle2 size={16} />} label="Organization health" value={formatHealthLabel(dashboard.summary?.healthStatus ?? "unknown")} tone={dashboard.summary?.healthStatus ?? "neutral"} />
      </div>

      {quickActions.length ? (
        <Card elevated className="workspace-block p-4">
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map((action) => (
              <Link
                key={`${action.label}-${action.href}`}
                to={action.href}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                  action.variant === "primary"
                    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                    : "border-border bg-background-tint text-text hover:border-primary/30 hover:text-primary"
                }`}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {alerts.length ? (
        <Card elevated className="workspace-block p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-soft">Action Required</p>
              <h3 className="mt-1 text-lg font-semibold text-text">What needs attention</h3>
            </div>
            <span className="rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
              {alerts.length} open
            </span>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {alerts.slice(0, 6).map((alert, index) => (
              <Link
                key={`${alert.widgetTitle}-${alert.message}-${index}`}
                to={alert.href ?? "#"}
                className={`rounded-xl border px-3 py-2.5 text-sm leading-6 ${getAlertTone(alert.severity)}`}
              >
                <span className="block text-xs font-semibold uppercase tracking-[0.16em]">{alert.widgetTitle}</span>
                <span className="mt-1 block">{alert.message}</span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {(isLoading ? Array.from({ length: 3 }, () => null as DynamicDashboardWidget | null) : widgets).map((widget, index) => (
          <motion.div key={widget?.id ?? index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 + index * 0.04 }}>
            <DynamicWidgetCard widget={widget} />
          </motion.div>
        ))}
      </div>

      {!isLoading && widgets.length === 0 ? (
        <Card elevated className="workspace-block p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-soft">No widgets enabled</p>
          <h3 className="mt-2 text-lg font-semibold text-text">This organization has no dashboard modules turned on.</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Enable Inbox, CRM, Sales, Campaigns, or AI from organization access limits to populate this page.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function DynamicWidgetCard({ widget }: { widget: DynamicDashboardWidget | null }) {
  if (!widget) {
    return (
      <Card elevated className="min-h-[260px] p-5">
        <div className="h-full animate-pulse rounded-xl bg-background-tint" />
      </Card>
    );
  }

  return (
    <Card elevated className="workspace-block flex min-h-[280px] flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={widget.href} className="text-lg font-semibold tracking-tight text-text hover:text-primary">
            {widget.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-muted">{widget.description}</p>
        </div>
        <StatusPill status={widget.status} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {widget.metrics.slice(0, 4).map((metric) => (
          <Link
            key={metric.label}
            to={metric.href ?? widget.href}
            className="rounded-xl border border-border bg-background-tint px-3 py-2.5 transition hover:border-primary/30 hover:bg-primary/5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-soft">{metric.label}</p>
            <p className={`mt-1 text-xl font-semibold tracking-tight ${getMetricTone(metric.tone)}`}>{metric.value}</p>
            {metric.hint ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{metric.hint}</p> : null}
          </Link>
        ))}
      </div>

      {widget.metrics.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
          No activity is visible yet. Use the quick action below to finish setup or create the first record for this module.
        </div>
      ) : null}

      {widget.alerts.length ? (
        <div className="mt-4 space-y-2">
          {widget.alerts.slice(0, 2).map((alert) => (
            <Link key={alert.message} to={alert.href ?? widget.href} className={`block rounded-xl border px-3 py-2 text-xs leading-5 ${getAlertTone(alert.severity)}`}>
              {alert.message}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {widget.quickActions.map((action) => (
          <Link
            key={`${action.label}-${action.href}`}
            to={action.href}
            className={`inline-flex min-h-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition ${
              action.variant === "primary"
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border bg-background-tint text-text-muted hover:border-primary/30 hover:text-primary"
            }`}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function SummaryStripCard({
  icon,
  label,
  value,
  tone = "neutral"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card elevated className="workspace-block min-h-[112px] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${getSummaryTone(tone)}`}>{icon}</span>
        <p className="text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-text">{value}</p>
    </Card>
  );
}

function DashboardStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(status)}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {formatHealthLabel(status)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(status)}`}>{formatHealthLabel(status)}</span>;
}

function HeroMetricCard({
  label,
  value,
  hint,
  tone,
  href
}: {
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning" | "neutral";
  href: string;
}) {
  const toneClass = {
    primary: "border-primary/20 bg-primary/10 text-primary",
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/20 bg-warning/10 text-warning",
    neutral: "border-border bg-background-tint text-text-muted"
  }[tone];

  return (
    <Link to={appendSalesSection(href, "timeline")} className="rounded-xl border border-border bg-card/90 p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
          <ArrowRight size={15} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{value}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{hint}</p>
    </Link>
  );
}

function CommandLink({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background-tint px-3 text-xs font-semibold text-text transition hover:border-primary/30 hover:text-primary">
      {icon}
      {label}
    </Link>
  );
}

function SignalRow({ label, value, delta, currency = false }: { label: string; value: string; delta?: number; currency?: boolean }) {
  const hasDelta = typeof delta === "number";
  const deltaValue = hasDelta ? delta : 0;
  const deltaLabel = !hasDelta ? null : currency ? formatCompactCurrency(Math.abs(deltaValue)) : `${Math.abs(deltaValue)}`;
  const deltaTone = !hasDelta || deltaValue === 0 ? "text-text-muted" : deltaValue > 0 ? "text-success" : "text-destructive";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-tint px-3 py-2.5">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      <span className="text-right">
        <span className="block text-sm font-semibold text-text">{value}</span>
        {deltaLabel ? <span className={`block text-[11px] font-semibold ${deltaTone}`}>{deltaValue > 0 ? "+" : deltaValue < 0 ? "-" : ""}{deltaLabel} vs yesterday</span> : null}
      </span>
    </div>
  );
}

function DashboardMetricCard({ metric, compact = false }: { metric: DashboardMetric | null; compact?: boolean }) {
  return (
    <Card elevated className={`metric-card ${compact ? "min-h-[112px] p-4" : "min-h-[138px] p-5"}`}>
      {metric ? (
        <>
          <p className="pr-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">{metric.label}</p>
          <p className={`${compact ? "mt-3 text-2xl" : "mt-4 text-3xl"} font-semibold tracking-tight text-text`}>{metric.value}</p>
          <p className={`${compact ? "mt-2" : "mt-3"} line-clamp-2 text-sm leading-6 text-text-muted`}>{metric.hint}</p>
        </>
      ) : (
        <div className="h-full animate-pulse rounded-xl bg-background-tint" />
      )}
    </Card>
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
    <Card elevated className="workspace-block overflow-hidden p-0">
      <details className="group" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden">
          <div className="min-w-0">
            {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-soft">{eyebrow}</p> : null}
            <h3 className="mt-1 truncate text-lg font-semibold text-text">{title}</h3>
            {summary ? <p className="mt-1 text-sm text-text-muted">{summary}</p> : null}
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-background-tint text-text-muted transition group-open:rotate-180">
            <ChevronDown size={16} />
          </span>
        </summary>
        <div className="border-t border-border px-5 pb-5 pt-4">{children}</div>
      </details>
    </Card>
  );
}

function DashboardAnalytics({ sales, showPerformance }: { sales: SalesDashboard; showPerformance: boolean }) {
  const isMobile = useIsMobileViewport();
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

      <DashboardGraphPanel sales={sales} trendDays={trendDays} showPerformance={showPerformance} defaultOpen={!isMobile} />

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
  showPerformance,
  defaultOpen
}: {
  sales: SalesDashboard;
  trendDays: TrendDay[];
  showPerformance: boolean;
  defaultOpen: boolean;
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
    <CompactSection title="Analysis panel" eyebrow="Compact Graphs" summary="Trends, stage mix, funnel, value, and team win rate in one view" defaultOpen={defaultOpen}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr),minmax(320px,0.85fr)]">
        <div className="workspace-subtle bg-gradient-to-br from-background-tint to-card p-4">
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
            <polyline points={createdPath} fill="none" stroke="rgb(var(--primary) / 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={wonPath} fill="none" stroke="rgb(var(--success) / 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            {trendDays.map((day, index) => {
              const x = getSparklineX(index, trendDays.length);

              return (
                <g key={day.key}>
                  <circle cx={x} cy={getSparklineY(day.createdOrders, maxCreated)} r="1.5" fill="rgb(var(--primary) / 1)">
                    <title>{`${day.label}: ${day.createdOrders} created orders`}</title>
                  </circle>
                  <circle cx={x} cy={getSparklineY(day.wonRevenue, maxWon)} r="1.5" fill="rgb(var(--success) / 1)">
                    <title>{`${day.label}: ${formatCompactCurrency(day.wonRevenue)} won revenue`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Created</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" />Won MYR</span>
          </div>
        </div>

        <div className="workspace-block p-4">
          <div className="grid items-center gap-3 sm:grid-cols-[116px,minmax(0,1fr)]">
            <div className="relative mx-auto h-28 w-28">
              <svg viewBox="0 0 120 120" role="img" aria-label="Pipeline order stage share donut" className="h-full w-full rotate-[-90deg]">
                <circle cx="60" cy="60" r="42" fill="none" stroke="rgb(var(--border) / 0.9)" strokeWidth="18" />
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
                      <span className={`h-2 w-2 rounded-full ${getPipelineDotTone(stage.status)}`} />
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
        <div className="workspace-subtle p-3">
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

        <div className="workspace-subtle p-3">
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

        <div className="workspace-subtle p-3">
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
                        className={`h-full rounded-full bg-gradient-to-r from-primary to-success ${getWidthClass(Math.max(winRate, winRate > 0 ? 8 : 2))}`}
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
            <circle cx="60" cy="60" r="42" fill="none" stroke="rgb(var(--border) / 0.9)" strokeWidth="18" />
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
                  <span className={`h-2.5 w-2.5 rounded-full ${getPipelineDotTone(stage.status)}`} />
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
            <div key={stage.status} className="workspace-subtle p-3 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text">{formatPipelineStatus(stage.status)}</p>
                  <p className="text-xs text-text-muted">{stage.count} orders - {share}% of total</p>
                </div>
                <p className="text-sm font-semibold text-text">{formatCompactCurrency(parseNumericValue(stage.value))}</p>
              </div>
              <div className="mt-3 h-9 overflow-hidden rounded-full bg-background-tint">
                <div
                  className={`flex h-full items-center justify-end rounded-full px-3 text-xs font-semibold ${getPipelineBarTone(stage.status)}`}
                  
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
                <div className="h-3 overflow-hidden rounded-full bg-card">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-primary to-success ${getWidthClass(Math.max(winRate, winRate > 0 ? 8 : 2))}`}
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
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" />Won MYR</span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-gradient-to-br from-background-tint to-card p-3">
        <svg viewBox="0 0 100 44" role="img" aria-label="Orders and won revenue sparkline" className="h-28 w-full overflow-visible">
          <polyline points={createdPath} fill="none" stroke="rgb(var(--primary) / 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={wonPath} fill="none" stroke="rgb(var(--success) / 0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {trendDays.map((day, index) => {
            const x = getSparklineX(index, trendDays.length);
            const createdY = getSparklineY(day.createdOrders, maxCreated);
            const wonY = getSparklineY(day.wonRevenue, maxWon);

            return (
              <g key={day.key}>
                <circle cx={x} cy={createdY} r="1.5" fill="rgb(var(--primary) / 1)">
                  <title>{`${day.label}: ${day.createdOrders} created orders`}</title>
                </circle>
                <circle cx={x} cy={wonY} r="1.5" fill="rgb(var(--success) / 1)">
                  <title>{`${day.label}: ${formatCompactCurrency(day.wonRevenue)} won revenue`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {trendDays.slice(-4).map((day) => (
            <div key={day.key} className="rounded-xl bg-card px-3 py-2 text-xs shadow-soft">
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
      <Card elevated className="workspace-block overflow-hidden p-0">
      <div className={`h-1.5 ${isSuccess ? "bg-gradient-to-r from-warning via-primary to-success" : "bg-gradient-to-r from-destructive via-primary to-warning"}`} />
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={isSuccess ? "mt-1 text-warning" : "mt-1 text-destructive"}>{icon}</span>
            <div>
              <h4 className="text-base font-semibold tracking-tight text-text">{title}</h4>
              <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isSuccess ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
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
      <span className={`flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-bold ${isSuccess ? getRankTone(index) : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
        {isSuccess && index < 3 ? <Medal size={18} /> : isSuccess ? `${index + 1}` : (
          <span className="text-center text-[10px] leading-tight">
            <span className="block">{index + 1}{getOrdinalSuffix(index + 1)}</span>
            <span className="block">Last</span>
          </span>
        )}
      </span>
      <span className={`flex h-8 min-w-8 items-center justify-center rounded-xl px-2 text-[11px] font-bold uppercase ${isSuccess ? "bg-background-tint text-primary" : "bg-destructive/10 text-destructive"}`}>
        {getInitials(leader.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{leader.name}</p>
        <p className={`mt-1 text-xs ${isSuccess ? "text-success" : "text-destructive"}`}>
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
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-sm font-bold text-primary shadow-soft">
                    {rank}
                  </span>
                  <div>
                    <p className="font-semibold text-text">{leader.name}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-text-soft">{formatRole(leader.role)} - {leader.won_count} won</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-text">{formatCompactCurrency(wonValue)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
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
    <Card elevated className="workspace-block min-h-[118px] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{value}</p>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-muted">{hint}</p>
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
      return "border-success/20 bg-success/10 text-success";
    case "closed_lost":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    default:
      return "border-warning/20 bg-warning/10 text-warning";
  }
}

function getPipelineBarTone(status: string) {
  switch (status) {
    case "closed_won":
      return "bg-success text-success-foreground";
    case "closed_lost":
      return "bg-destructive text-destructive-foreground";
    default:
      return "bg-warning text-warning-foreground";
  }
}

function getPipelineGraphColor(status: string) {
  switch (status) {
    case "closed_won":
      return "rgb(var(--success) / 0.95)";
    case "closed_lost":
      return "rgb(var(--destructive) / 0.95)";
    default:
      return "rgb(var(--warning) / 0.95)";
  }
}

function getPipelineDotTone(status: string) {
  switch (status) {
    case "closed_won":
      return "bg-success";
    case "closed_lost":
      return "bg-destructive";
    default:
      return "bg-warning";
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case "healthy":
      return "border-success/20 bg-success/10 text-success";
    case "warning":
      return "border-warning/20 bg-warning/10 text-warning";
    case "critical":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    case "empty":
      return "border-border bg-background-tint text-text-muted";
    default:
      return "border-border bg-background-tint text-text-muted";
  }
}

function getMetricTone(tone?: DashboardMetric["tone"]) {
  switch (tone) {
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-destructive";
    case "primary":
      return "text-primary";
    default:
      return "text-text";
  }
}

function getSummaryTone(tone: string) {
  switch (tone) {
    case "healthy":
    case "success":
      return "border-success/20 bg-success/10 text-success";
    case "warning":
      return "border-warning/20 bg-warning/10 text-warning";
    case "critical":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    default:
      return "border-primary/20 bg-primary/10 text-primary";
  }
}

function getAlertTone(severity: "info" | "warning" | "critical") {
  switch (severity) {
    case "critical":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    case "warning":
      return "border-warning/20 bg-warning/10 text-warning";
    default:
      return "border-primary/20 bg-primary/10 text-primary";
  }
}

function formatHealthLabel(status: string) {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
    case "empty":
      return "No data";
    case "locked":
      return "Locked";
    default:
      return "Unknown";
  }
}

function formatModuleKey(moduleKey: string) {
  switch (moduleKey) {
    case "campaign.whatsapp":
      return "WhatsApp Campaigns";
    case "campaign.email":
      return "Email Campaigns";
    case "ai_message_assist":
    case "ai":
      return "AI Assist";
    case "crm":
      return "CRM";
    default:
      return moduleKey
        .split(/[._-]/g)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");
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

function findMetric(metrics: DashboardMetric[], labelPart: string) {
  const normalized = labelPart.toLowerCase();
  return metrics.find((metric) => metric.label.toLowerCase().includes(normalized));
}

function findStat(metrics: DashboardMetric[], label: string) {
  return metrics.find((metric) => metric.label.toLowerCase() === label.toLowerCase());
}

function buildSalesBrief(input: {
  openValue: number;
  wonValue: number;
  conversionRate: number;
  activeLeadsValue?: DashboardMetric["value"];
  attentionCount: number;
  latestCreated: number;
  latestWon: number;
  topPerformerName?: string;
  conversationValue?: DashboardMetric["value"];
}) {
  const brief = [
    {
      title: "Revenue focus",
      detail:
        input.openValue > 0
          ? `${formatCompactCurrency(input.openValue)} is still open. Prioritize the highest-value active deals before starting new outreach.`
          : `No open pipeline value is visible yet. Start from active leads and conversations to create the next opportunity.`
    },
    {
      title: "Momentum",
      detail:
        input.latestCreated > 0 || input.latestWon > 0
          ? `${input.latestCreated} orders were created and ${formatCompactCurrency(input.latestWon)} was won in the latest bucket.`
          : `No new sales movement is visible in the latest bucket, so today's first job is generating movement.`
    },
    {
      title: "Team action",
      detail:
        input.attentionCount > 0
          ? `${input.attentionCount} team member${input.attentionCount === 1 ? "" : "s"} sit below the current sales benchmark. Review their open deals and next follow-ups.`
          : input.topPerformerName
            ? `${input.topPerformerName} is leading the board. Use the same playbook across active leads.`
            : `Team coaching signals will appear after orders are assigned and closed.`
    }
  ];

  if (typeof input.activeLeadsValue !== "undefined" || typeof input.conversationValue !== "undefined") {
    brief[2] = {
      title: "Next action pool",
      detail: `${input.activeLeadsValue ?? "No"} active leads and ${input.conversationValue ?? "no"} conversation load are visible. Work the warmest contact first.`
    };
  }

  return brief;
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
      return "border-warning/20 bg-warning/10 text-warning";
    case 1:
      return "border-border bg-muted text-muted-foreground";
    case 2:
      return "border-primary/20 bg-primary/10 text-primary";
    default:
      return "border-success/20 bg-success/10 text-success";
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
