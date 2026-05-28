import type { DashboardProvider } from "./types.js";
import { createWidget, safeQuery } from "./types.js";

export const campaignWhatsappDashboardProvider: DashboardProvider = {
  moduleKey: "campaign.whatsapp",
  title: "WhatsApp Campaigns",
  description: "Broadcast execution, delivery risk, and campaign backlog.",
  priority: 40,
  async getWidget(_authUser, client, context) {
    const organizationId = context.organizationId;
    if (!organizationId) {
      return createWidget({
        id: "campaign-whatsapp",
        moduleKey: "campaign.whatsapp",
        title: this.title,
        description: this.description,
        status: "empty",
        priority: this.priority,
        href: "/campaigns",
        metrics: [],
        alerts: [{ severity: "info", message: "Select an organization to view campaign activity." }],
        quickActions: [],
        updatedAt: context.generatedAt
      });
    }

    const [campaigns, recipients] = await Promise.all([
      safeQuery<{ total: string; sent_this_month: string; failed_this_month: string }>(
        client,
        `
          select
            count(*)::text as total,
            count(*) filter (
              where status in ('sending', 'completed')
                and updated_at >= date_trunc('month', timezone('utc', now()))
            )::text as sent_this_month,
            count(*) filter (
              where status = 'failed'
                and updated_at >= date_trunc('month', timezone('utc', now()))
            )::text as failed_this_month
          from campaigns
          where organization_id = $1
        `,
        [organizationId],
        [{ total: "0", sent_this_month: "0", failed_this_month: "0" }]
      ),
      safeQuery<{ pending: string }>(
        client,
        `
          select count(*)::text as pending
          from campaign_recipients
          where organization_id = $1
            and send_status in ('pending', 'queued')
        `,
        [organizationId],
        [{ pending: "0" }]
      )
    ]);

    const row = campaigns[0] ?? { total: "0", sent_this_month: "0", failed_this_month: "0" };
    const pending = Number(recipients[0]?.pending ?? 0);
    const failed = Number(row.failed_this_month ?? 0);
    const total = Number(row.total ?? 0);
    const alerts = [
      ...(failed > 0 ? [{ severity: "warning" as const, message: `${failed} campaign${failed === 1 ? "" : "s"} failed this month.`, href: "/campaigns" }] : []),
      ...(pending > 500 ? [{ severity: "info" as const, message: "Large queued recipient backlog. Keep connector health under watch.", href: "/campaigns" }] : [])
    ];

    return createWidget({
      id: "campaign-whatsapp",
      moduleKey: "campaign.whatsapp",
      title: this.title,
      description: this.description,
      status: total === 0 ? "empty" : alerts.some((alert) => alert.severity === "warning") ? "warning" : "healthy",
      priority: this.priority,
      href: "/campaigns",
      metrics: [
        { label: "Total campaigns", value: total, href: "/campaigns", tone: "primary" },
        { label: "Sent this month", value: Number(row.sent_this_month ?? 0), href: "/campaigns", tone: "success" },
        { label: "Failed this month", value: failed, href: "/campaigns", tone: failed > 0 ? "danger" : "neutral" },
        { label: "Pending recipients", value: pending, href: "/campaigns", tone: pending > 0 ? "warning" : "neutral" }
      ],
      alerts,
      quickActions: [
        { label: "Create WhatsApp Campaign", href: "/campaigns/new", variant: "primary" },
        { label: "View Campaign History", href: "/campaigns", variant: "secondary" }
      ],
      updatedAt: context.generatedAt
    });
  }
};
