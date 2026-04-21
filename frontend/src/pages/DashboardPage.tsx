import { motion } from "framer-motion";
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
    </section>
  );
}
