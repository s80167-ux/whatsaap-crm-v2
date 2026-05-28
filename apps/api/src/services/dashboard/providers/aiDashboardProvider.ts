import type { DashboardProvider } from "./types.js";
import { createWidget, safeQuery } from "./types.js";

export const aiDashboardProvider: DashboardProvider = {
  moduleKey: "ai_message_assist",
  title: "AI Assist",
  description: "AI usage, credits, and source mix.",
  priority: 70,
  async getWidget(_authUser, client, context) {
    const organizationId = context.organizationId;
    if (!organizationId) {
      return createWidget({
        id: "ai-message-assist",
        moduleKey: "ai_message_assist",
        title: this.title,
        description: this.description,
        status: "empty",
        priority: this.priority,
        href: "/inbox/whatsapp",
        metrics: [],
        alerts: [{ severity: "info", message: "Select an organization to view AI usage." }],
        quickActions: [],
        updatedAt: context.generatedAt
      });
    }

    const [todayRows, monthRows, sourceRows, limitRows] = await Promise.all([
      safeQuery<{ requests: string; credit_units: string }>(
        client,
        `
          select count(*)::text as requests, coalesce(sum(credit_units), 0)::text as credit_units
          from ai_usage_events
          where organization_id = $1
            and created_at >= date_trunc('day', timezone('utc', now()))
        `,
        [organizationId],
        [{ requests: "0", credit_units: "0" }]
      ),
      safeQuery<{ requests: string; credit_units: string }>(
        client,
        `
          select count(*)::text as requests, coalesce(sum(credit_units), 0)::text as credit_units
          from ai_usage_events
          where organization_id = $1
            and created_at >= date_trunc('month', timezone('utc', now()))
        `,
        [organizationId],
        [{ requests: "0", credit_units: "0" }]
      ),
      safeQuery<{ source: string; requests: string }>(
        client,
        `
          select coalesce(source, 'other') as source, count(*)::text as requests
          from ai_usage_events
          where organization_id = $1
            and created_at >= date_trunc('month', timezone('utc', now()))
          group by coalesce(source, 'other')
          order by count(*) desc
          limit 1
        `,
        [organizationId],
        []
      ),
      safeQuery<{ limit_key: string; limit_value: string }>(
        client,
        `
          select limit_key, limit_value::text as limit_value
          from organization_limits
          where organization_id = $1
            and limit_key in ('ai_daily_credits', 'ai_monthly_credits')
        `,
        [organizationId],
        []
      )
    ]);

    const dailyLimit = Number(limitRows.find((row) => row.limit_key === "ai_daily_credits")?.limit_value ?? 100);
    const monthlyLimit = Number(limitRows.find((row) => row.limit_key === "ai_monthly_credits")?.limit_value ?? 1000);
    const todayCredits = Number(todayRows[0]?.credit_units ?? 0);
    const monthCredits = Number(monthRows[0]?.credit_units ?? 0);
    const nearDailyLimit = dailyLimit > 0 && todayCredits >= dailyLimit * 0.8;
    const nearMonthlyLimit = monthlyLimit > 0 && monthCredits >= monthlyLimit * 0.8;
    const alerts = [
      ...(nearDailyLimit ? [{ severity: "warning" as const, message: "AI usage is near the daily credit limit." }] : []),
      ...(nearMonthlyLimit ? [{ severity: "warning" as const, message: "AI usage is near the monthly credit limit." }] : [])
    ];

    return createWidget({
      id: "ai-message-assist",
      moduleKey: "ai_message_assist",
      title: this.title,
      description: this.description,
      // Missing AI usage tables produce a quiet empty widget so older dev DBs keep loading.
      status: alerts.length ? "warning" : Number(monthRows[0]?.requests ?? 0) === 0 ? "empty" : "healthy",
      priority: this.priority,
      href: "/inbox/whatsapp",
      metrics: [
        { label: "AI usage today", value: Number(todayRows[0]?.requests ?? 0), tone: "primary" },
        { label: "AI usage this month", value: Number(monthRows[0]?.requests ?? 0), tone: "primary" },
        { label: "Credit usage", value: `${monthCredits}/${monthlyLimit}`, tone: nearMonthlyLimit ? "warning" : "neutral" },
        { label: "Most-used source", value: sourceRows[0]?.source ?? "None" }
      ],
      alerts,
      quickActions: [{ label: "Open AI Assist", href: "/inbox/whatsapp", variant: "primary" }],
      updatedAt: context.generatedAt
    });
  }
};
