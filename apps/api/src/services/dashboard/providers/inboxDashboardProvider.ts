import type { DashboardProvider } from "./types.js";
import { createWidget } from "./types.js";

export const inboxDashboardProvider: DashboardProvider = {
  moduleKey: "inbox",
  title: "Inbox",
  description: "Live conversation load and WhatsApp account readiness.",
  priority: 10,
  async getWidget(authUser, client, context) {
    const organizationId = context.organizationId;
    if (!organizationId) {
      return createWidget({
        id: "inbox",
        moduleKey: "inbox",
        title: this.title,
        description: this.description,
        status: "empty",
        priority: this.priority,
        href: "/inbox/whatsapp",
        metrics: [],
        alerts: [{ severity: "info", message: "Select an organization to view inbox activity." }],
        quickActions: [],
        updatedAt: context.generatedAt
      });
    }

    const assignedOnly = context.scope === "agent" && authUser.organizationUserId;
    const conversationScope = assignedOnly
      ? `and (
          assigned_user_id = $2
          or exists (
            select 1
            from conversation_assignments ca
            where ca.conversation_id = conversations.id
              and ca.organization_user_id = $2
          )
        )`
      : "";
    const messageScope = assignedOnly
      ? `and conversation_id in (
          select c.id
          from conversations c
          where c.organization_id = $1
            and (
              c.assigned_user_id = $2
              or exists (
                select 1
                from conversation_assignments ca
                where ca.conversation_id = c.id
                  and ca.organization_user_id = $2
              )
            )
        )`
      : "";
    const params = assignedOnly ? [organizationId, authUser.organizationUserId] : [organizationId];
    const [openConversations, messagesToday, accounts, unhealthyAccounts] = await Promise.all([
      client.query<{ count: string }>(
        `select count(*)::text as count from conversations where organization_id = $1 and status = 'open' ${conversationScope}`,
        params
      ),
      client.query<{ count: string }>(
        `
          select count(*)::text as count
          from messages
          where organization_id = $1
            and sent_at >= date_trunc('day', timezone('utc', now()))
            ${messageScope}
        `,
        params
      ),
      client.query<{ count: string }>(
        `
          select count(*)::text as count
          from whatsapp_accounts
          where organization_id = $1
            and connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required')
        `,
        [organizationId]
      ),
      client.query<{ count: string }>(
        `
          select count(*)::text as count
          from whatsapp_accounts
          where organization_id = $1
            and connection_status not in ('connected', 'reconnecting', 'pairing', 'qr_required')
        `,
        [organizationId]
      )
    ]);

    const activeAccounts = Number(accounts.rows[0]?.count ?? 0);
    const unhealthy = Number(unhealthyAccounts.rows[0]?.count ?? 0);
    const alerts = [
      ...(activeAccounts === 0
        ? [{ severity: "critical" as const, message: "No active WhatsApp account is connected.", href: "/setup/channels/whatsapp" }]
        : []),
      ...(unhealthy > 0
        ? [{ severity: "warning" as const, message: `${unhealthy} WhatsApp account${unhealthy === 1 ? "" : "s"} need attention.`, href: "/setup/channels/whatsapp" }]
        : [])
    ];

    return createWidget({
      id: "inbox",
      moduleKey: "inbox",
      title: this.title,
      description: this.description,
      status: alerts.some((alert) => alert.severity === "critical") ? "critical" : alerts.length ? "warning" : "healthy",
      priority: this.priority,
      href: "/inbox/whatsapp",
      metrics: [
        { label: "Open conversations", value: Number(openConversations.rows[0]?.count ?? 0), href: "/inbox/whatsapp", tone: "primary" },
        { label: "Messages today", value: Number(messagesToday.rows[0]?.count ?? 0), hint: "Inbound and outbound since midnight UTC" },
        { label: "Active WhatsApp accounts", value: activeAccounts, href: "/setup/channels/whatsapp", tone: activeAccounts > 0 ? "success" : "danger" }
      ],
      alerts,
      quickActions: [
        { label: "Open Inbox", href: "/inbox/whatsapp", variant: "primary" },
        { label: "Setup WhatsApp", href: "/setup/channels/whatsapp", variant: "secondary" }
      ],
      updatedAt: context.generatedAt
    });
  }
};
