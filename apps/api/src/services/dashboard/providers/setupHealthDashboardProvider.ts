import type { DashboardProvider } from "./types.js";
import { createWidget } from "./types.js";

export const setupHealthDashboardProvider: DashboardProvider = {
  moduleKey: "setup.health",
  title: "Setup Health",
  description: "Critical setup blockers across channels and sync.",
  priority: 5,
  async getWidget(_authUser, client, context) {
    const organizationId = context.organizationId;
    if (!organizationId) {
      return createWidget({
        id: "setup-health",
        moduleKey: "setup.health",
        title: this.title,
        description: this.description,
        status: "empty",
        priority: this.priority,
        href: "/setup",
        metrics: [],
        alerts: [{ severity: "info", message: "Select an organization to inspect setup health." }],
        quickActions: [],
        updatedAt: context.generatedAt
      });
    }

    const [accounts, staleAccounts] = await Promise.all([
      client.query<{ total: string; connected: string; unhealthy: string }>(
        `
          select
            count(*)::text as total,
            count(*) filter (where connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required'))::text as connected,
            count(*) filter (where connection_status not in ('connected', 'reconnecting', 'pairing', 'qr_required'))::text as unhealthy
          from whatsapp_accounts
          where organization_id = $1
        `,
        [organizationId]
      ),
      client.query<{ count: string }>(
        `
          select count(*)::text as count
          from whatsapp_accounts
          where organization_id = $1
            and connector_heartbeat_at is not null
            and connector_heartbeat_at < timezone('utc', now()) - interval '10 minutes'
        `,
        [organizationId]
      )
    ]);

    const total = Number(accounts.rows[0]?.total ?? 0);
    const connected = Number(accounts.rows[0]?.connected ?? 0);
    const unhealthy = Number(accounts.rows[0]?.unhealthy ?? 0);
    const stale = Number(staleAccounts.rows[0]?.count ?? 0);
    const alerts = [
      ...(total === 0 ? [{ severity: "critical" as const, message: "WhatsApp setup is missing.", href: "/setup/channels/whatsapp" }] : []),
      ...(total > 0 && connected === 0 ? [{ severity: "critical" as const, message: "All WhatsApp accounts are disconnected.", href: "/setup/channels/whatsapp" }] : []),
      ...(unhealthy > 0 ? [{ severity: "warning" as const, message: `${unhealthy} account${unhealthy === 1 ? "" : "s"} need reconnection.`, href: "/setup/channels/whatsapp" }] : []),
      ...(stale > 0 ? [{ severity: "warning" as const, message: `${stale} connector heartbeat${stale === 1 ? " is" : "s are"} stale.`, href: "/setup/channels/whatsapp" }] : [])
    ];

    return createWidget({
      id: "setup-health",
      moduleKey: "setup.health",
      title: this.title,
      description: this.description,
      status: alerts.some((alert) => alert.severity === "critical") ? "critical" : alerts.length ? "warning" : "healthy",
      priority: this.priority,
      href: "/setup",
      metrics: [
        { label: "WhatsApp accounts", value: total, href: "/setup/channels/whatsapp" },
        { label: "Connected", value: connected, href: "/setup/channels/whatsapp", tone: connected > 0 ? "success" : "danger" },
        { label: "Reconnect issues", value: unhealthy + stale, href: "/setup/channels/whatsapp", tone: unhealthy + stale > 0 ? "warning" : "success" }
      ],
      alerts,
      quickActions: [
        { label: "Setup Channel", href: "/setup/channels/whatsapp", variant: "primary" },
        { label: "Open Setup", href: "/setup", variant: "secondary" }
      ],
      updatedAt: context.generatedAt
    });
  }
};
