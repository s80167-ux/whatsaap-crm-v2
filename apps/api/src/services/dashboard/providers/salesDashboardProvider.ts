import type { DashboardProvider } from "./types.js";
import { createWidget } from "./types.js";

export const salesDashboardProvider: DashboardProvider = {
  moduleKey: "sales",
  title: "Sales",
  description: "Pipeline value, conversion, and lead movement.",
  priority: 60,
  async getWidget(authUser, client, context) {
    const organizationId = context.organizationId;
    if (!organizationId) {
      return createWidget({
        id: "sales",
        moduleKey: "sales",
        title: this.title,
        description: this.description,
        status: "empty",
        priority: this.priority,
        href: "/sales",
        metrics: [],
        alerts: [{ severity: "info", message: "Select an organization to view sales performance." }],
        quickActions: [],
        updatedAt: context.generatedAt
      });
    }

    const assignedOnly = context.scope === "agent" && authUser.organizationUserId;
    const orderScope = assignedOnly ? "and so.assigned_user_id = $2" : "";
    const leadScope = assignedOnly ? "and l.assigned_user_id = $2" : "";
    const params = assignedOnly ? [organizationId, authUser.organizationUserId] : [organizationId];
    const [salesRows, leadRows] = await Promise.all([
      client.query<{ status: string; count: string; value: string }>(
        `
          select
            so.status,
            count(*)::text as count,
            coalesce(sum(so.total_amount), 0)::text as value
          from sales_orders so
          where so.organization_id = $1
            ${orderScope}
          group by so.status
        `,
        params
      ),
      client.query<{ status: string; count: string }>(
        `
          select l.status, count(*)::text as count
          from leads l
          where l.organization_id = $1
            ${leadScope}
          group by l.status
        `,
        params
      )
    ]);

    const salesByStatus = new Map(salesRows.rows.map((row) => [row.status, row]));
    const leadsByStatus = new Map(leadRows.rows.map((row) => [row.status, row]));
    const openCount = Number(salesByStatus.get("open")?.count ?? 0);
    const wonCount = Number(salesByStatus.get("closed_won")?.count ?? 0);
    const lostCount = Number(salesByStatus.get("closed_lost")?.count ?? 0);
    const totalOrders = openCount + wonCount + lostCount;
    const conversionRate = totalOrders > 0 ? Math.round((wonCount / totalOrders) * 100) : 0;
    const activeLeads =
      Number(leadsByStatus.get("new_lead")?.count ?? 0) +
      Number(leadsByStatus.get("contacted")?.count ?? 0) +
      Number(leadsByStatus.get("interested")?.count ?? 0) +
      Number(leadsByStatus.get("processing")?.count ?? 0);
    const openPipeline = Number(salesByStatus.get("open")?.value ?? 0);
    const wonRevenue = Number(salesByStatus.get("closed_won")?.value ?? 0);
    const alerts = [
      ...(openPipeline > 0 && activeLeads === 0
        ? [{ severity: "info" as const, message: "Pipeline exists but no active leads are currently visible.", href: "/sales" }]
        : []),
      ...(lostCount > wonCount && totalOrders > 0
        ? [{ severity: "warning" as const, message: "Lost orders are above won orders. Review follow-up quality.", href: "/reports" }]
        : [])
    ];

    return createWidget({
      id: "sales",
      moduleKey: "sales",
      title: this.title,
      description: this.description,
      status: totalOrders === 0 && activeLeads === 0 ? "empty" : alerts.some((alert) => alert.severity === "warning") ? "warning" : "healthy",
      priority: this.priority,
      href: "/sales",
      metrics: [
        { label: "Open pipeline", value: `MYR ${openPipeline.toFixed(2)}`, href: "/sales?status=open", tone: "warning" },
        { label: "Won revenue", value: `MYR ${wonRevenue.toFixed(2)}`, href: "/sales?status=closed_won", tone: "success" },
        { label: "Lost orders", value: lostCount, href: "/sales?status=closed_lost", tone: lostCount > 0 ? "danger" : "neutral" },
        { label: "Conversion rate", value: `${conversionRate}%`, href: "/reports", tone: conversionRate > 0 ? "primary" : "neutral" },
        { label: "Active leads", value: activeLeads, href: "/leads", tone: "primary" }
      ],
      alerts,
      quickActions: [
        { label: "View Sales", href: "/sales", variant: "primary" },
        { label: "View Reports", href: "/reports", variant: "secondary" }
      ],
      updatedAt: context.generatedAt
    });
  }
};
