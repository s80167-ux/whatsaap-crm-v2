import type { DashboardProvider } from "./types.js";
import { createWidget, safeQuery } from "./types.js";

export const campaignEmailDashboardProvider: DashboardProvider = {
  moduleKey: "campaign.email",
  title: "Email Campaigns",
  description: "Sender setup and email campaign readiness.",
  priority: 45,
  async getWidget(_authUser, client, context) {
    const organizationId = context.organizationId;
    if (!organizationId) {
      return createWidget({
        id: "campaign-email",
        moduleKey: "campaign.email",
        title: this.title,
        description: this.description,
        status: "empty",
        priority: this.priority,
        href: "/campaigns/email",
        metrics: [],
        alerts: [{ severity: "info", message: "Select an organization to view email campaign readiness." }],
        quickActions: [],
        updatedAt: context.generatedAt
      });
    }

    const [senders, campaigns] = await Promise.all([
      safeQuery<{ configured: string; active: string }>(
        client,
        `
          select
            count(*)::text as configured,
            count(*) filter (where status in ('active', 'verified'))::text as active
          from email_senders
          where organization_id = $1
            and status <> 'deleted'
        `,
        [organizationId],
        [{ configured: "0", active: "0" }]
      ),
      safeQuery<{ total: string; sent_this_month: string }>(
        client,
        `
          select
            count(*)::text as total,
            count(*) filter (
              where status in ('sending', 'sent')
                and updated_at >= date_trunc('month', timezone('utc', now()))
            )::text as sent_this_month
          from email_campaigns
          where organization_id = $1
        `,
        [organizationId],
        [{ total: "0", sent_this_month: "0" }]
      )
    ]);

    const configured = Number(senders[0]?.configured ?? 0);
    const active = Number(senders[0]?.active ?? 0);
    const totalCampaigns = Number(campaigns[0]?.total ?? 0);
    const alerts = [
      ...(configured === 0
        ? [{ severity: "warning" as const, message: "No email sender is configured yet.", href: "/campaigns/email/setup" }]
        : []),
      ...(configured > 0 && active === 0
        ? [{ severity: "warning" as const, message: "Email sender exists but is not active.", href: "/campaigns/email/setup" }]
        : [])
    ];

    return createWidget({
      id: "campaign-email",
      moduleKey: "campaign.email",
      title: this.title,
      description: this.description,
      // Email campaign tables are optional in older dev DBs, so a zeroed widget is intentional MVP fallback.
      status: alerts.length ? "warning" : totalCampaigns === 0 ? "empty" : "healthy",
      priority: this.priority,
      href: "/campaigns/email",
      metrics: [
        { label: "SMTP configured", value: configured, href: "/campaigns/email/setup", tone: configured > 0 ? "success" : "warning" },
        { label: "Active senders", value: active, href: "/campaigns/email/setup" },
        { label: "Email sent this month", value: Number(campaigns[0]?.sent_this_month ?? 0), href: "/campaigns/email", tone: "primary" }
      ],
      alerts,
      quickActions: [
        { label: "Setup Email Sender", href: "/campaigns/email/setup", variant: "primary" },
        { label: "Create Email Campaign", href: "/campaigns/email/new", variant: "secondary" }
      ],
      updatedAt: context.generatedAt
    });
  }
};
