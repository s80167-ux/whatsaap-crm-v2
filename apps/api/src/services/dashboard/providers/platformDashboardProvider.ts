import type { DashboardProvider } from "./types.js";
import { createWidget } from "./types.js";

export const platformDashboardProvider: DashboardProvider = {
  moduleKey: "platform",
  title: "Platform",
  description: "Tenant, user, and account health across the platform.",
  priority: 1,
  async getWidget(_authUser, client, context) {
    const [organizations, users, accounts] = await Promise.all([
      client.query<{ total: string; active: string }>(
        `
          select
            count(*)::text as total,
            count(*) filter (where status in ('active', 'trial'))::text as active
          from organizations
        `
      ),
      client.query<{ count: string }>("select count(*)::text as count from organization_users where status = 'active'"),
      client.query<{ total: string; healthy: string }>(
        `
          select
            count(*)::text as total,
            count(*) filter (where connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required'))::text as healthy
          from whatsapp_accounts
        `
      )
    ]);

    const totalAccounts = Number(accounts.rows[0]?.total ?? 0);
    const healthyAccounts = Number(accounts.rows[0]?.healthy ?? 0);
    const unhealthyAccounts = Math.max(totalAccounts - healthyAccounts, 0);

    return createWidget({
      id: "platform",
      moduleKey: "platform",
      title: this.title,
      description: this.description,
      status: unhealthyAccounts > 0 ? "warning" : "healthy",
      priority: this.priority,
      href: "/platform",
      metrics: [
        { label: "Organizations", value: Number(organizations.rows[0]?.total ?? 0), href: "/platform", tone: "primary" },
        { label: "Active tenants", value: Number(organizations.rows[0]?.active ?? 0), href: "/platform", tone: "success" },
        { label: "Active users", value: Number(users.rows[0]?.count ?? 0), href: "/platform" },
        { label: "Unhealthy accounts", value: unhealthyAccounts, href: "/platform", tone: unhealthyAccounts > 0 ? "warning" : "success" }
      ],
      alerts: unhealthyAccounts > 0 ? [{ severity: "warning", message: `${unhealthyAccounts} WhatsApp account${unhealthyAccounts === 1 ? "" : "s"} need platform attention.`, href: "/platform" }] : [],
      quickActions: [
        { label: "Open Platform", href: "/platform", variant: "primary" },
        { label: "Access Limits", href: "/super-admin/access-limits", variant: "secondary" }
      ],
      updatedAt: context.generatedAt
    });
  }
};
