import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { useRoleDashboard } from "../hooks/useDashboard";
import { getStoredUser } from "../lib/auth";
import type { DashboardMetric } from "../types/dashboard";

export function DashboardPage() {
  const user = getStoredUser();
  const { data, isLoading } = useRoleDashboard();

  const title =
    user?.role === "super_admin"
      ? "Platform dashboard"
      : user?.role === "org_admin" || user?.role === "manager"
        ? "Organization dashboard"
        : "My dashboard";

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
                  <Link
                    key={metric.label}
                    to={metric.href}
                    className="rounded-2xl border border-border bg-background-tint p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{metric.label}</p>
                    <p className="mt-3 text-2xl font-semibold text-text">{metric.value}</p>
                    <p className="mt-2 text-sm leading-6 text-text-muted">{metric.hint}</p>
                  </Link>
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
                <Link
                  key={stage.status}
                  to={stage.href ?? "/sales"}
                  className="block rounded-2xl border border-border bg-background-tint p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-text">{formatPipelineStatus(stage.status)}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPipelineTone(stage.status)}`}>
                      {stage.count} orders
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-muted">{formatCurrencyValue(stage.value)}</p>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
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
