import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { OrganizationAdminRepository } from "../repositories/organizationAdminRepository.js";
import type { AuthUser } from "../types/auth.js";
import { aiDashboardProvider } from "./dashboard/providers/aiDashboardProvider.js";
import { campaignEmailDashboardProvider } from "./dashboard/providers/campaignEmailDashboardProvider.js";
import { campaignWhatsappDashboardProvider } from "./dashboard/providers/campaignWhatsappDashboardProvider.js";
import { crmDashboardProvider } from "./dashboard/providers/crmDashboardProvider.js";
import { inboxDashboardProvider } from "./dashboard/providers/inboxDashboardProvider.js";
import { platformDashboardProvider } from "./dashboard/providers/platformDashboardProvider.js";
import { salesDashboardProvider } from "./dashboard/providers/salesDashboardProvider.js";
import { setupHealthDashboardProvider } from "./dashboard/providers/setupHealthDashboardProvider.js";
import { safeQuery } from "./dashboard/providers/types.js";
import type { DashboardProvider, DashboardScope, DashboardWidget, DashboardWidgetStatus } from "./dashboard/providers/types.js";

type DashboardSummary = {
  scope: "agent" | "admin" | "super_admin";
  organizationId?: string | null;
  generatedAt?: string;
  enabledModules?: string[];
  analytics?: DashboardAnalytics;
  summary?: {
    title: string;
    subtitle: string;
    healthStatus: "healthy" | "warning" | "critical" | "unknown";
    activeModuleCount: number;
    alertCount: number;
  };
  widgets?: DashboardWidget[];
  metrics: Array<{
    label: string;
    value: number | string;
    hint: string;
  }>;
  sales?: {
    title: string;
    stats: Array<{
      label: string;
      value: number | string;
      hint: string;
      href?: string;
    }>;
    pipeline: Array<{
      status: string;
      count: number;
      value: string;
      href?: string;
    }>;
    trends?: Array<{
      label: string;
      metric: "created_orders" | "won_revenue";
      value: number | string;
      range_start: string;
      range_end: string;
      href?: string;
    }>;
    leaderboard?: Array<{
      id: string;
      name: string;
      role?: string | null;
      order_count: number;
      won_count: number;
      won_value: string;
      open_value: string;
    }>;
    leaderboard_attention?: Array<{
      id: string;
      name: string;
      role?: string | null;
      order_count: number;
      won_count: number;
      won_value: string;
      open_value: string;
    }>;
    leaderboard_average_won_count?: number;
  };
};

type DashboardDateRangeDays = 7 | 30 | 90;

type DashboardTrendPoint = {
  key: string;
  label: string;
  value: number;
  secondaryValue?: number;
  href?: string;
};

type DashboardBreakdownSegment = {
  key: string;
  label: string;
  value: number;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
};

type DashboardAnalytics = {
  dateRangeDays: DashboardDateRangeDays;
  availableDateRanges: DashboardDateRangeDays[];
  campaignPerformanceTrend?: {
    title: string;
    description: string;
    points: DashboardTrendPoint[];
  };
  contactGrowthTrend?: {
    title: string;
    description: string;
    points: DashboardTrendPoint[];
  };
  conversationStatusBreakdown?: {
    title: string;
    description: string;
    segments: DashboardBreakdownSegment[];
  };
  campaignFunnel?: {
    title: string;
    description: string;
    segments: DashboardBreakdownSegment[];
  };
  followUpHealth?: {
    title: string;
    description: string;
    segments: DashboardBreakdownSegment[];
  };
  moduleUsageOverview?: {
    title: string;
    description: string;
    segments: DashboardBreakdownSegment[];
  };
};

const LEGACY_CAMPAIGNS_MODULE_KEY = "campaigns";
const CAMPAIGN_MODULE_KEY = "campaign";
const CORE_DEFAULT_MODULE_KEYS = new Set(["inbox", "crm", "sales"]);
const CAMPAIGN_CHILD_MODULE_KEYS = ["campaign.whatsapp", "campaign.email"] as const;
const ORGANIZATION_DASHBOARD_PROVIDERS: DashboardProvider[] = [
  inboxDashboardProvider,
  crmDashboardProvider,
  campaignWhatsappDashboardProvider,
  campaignEmailDashboardProvider,
  salesDashboardProvider,
  aiDashboardProvider
];

type SalesLeaderboardEntry = {
  id: string;
  name: string;
  role?: string | null;
  order_count: number;
  won_count: number;
  won_value: string;
  open_value: string;
};

function buildDailyRanges(days: number) {
  const now = new Date();
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return Array.from({ length: days }, (_, index) => {
    const start = new Date(startOfTodayUtc);
    start.setUTCDate(start.getUTCDate() - (days - index - 1));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return {
      label: start.toLocaleDateString("en-MY", { month: "short", day: "numeric", timeZone: "UTC" }),
      range_start: start.toISOString(),
      range_end: end.toISOString()
    };
  });
}

function normalizeDashboardDateRangeDays(value?: number): DashboardDateRangeDays {
  return value === 7 || value === 90 ? value : 30;
}

async function getSalesLeaderboard(
  client: PoolClient,
  input: { organizationId?: string; organizationUserId?: string }
) {
  const filters = ["ou.status = 'active'", "ou.role in ('org_admin', 'manager', 'agent', 'user')"];
  const params: string[] = [];

  if (input.organizationId) {
    params.push(input.organizationId);
    filters.push(`ou.organization_id = $${params.length}`);
  }

  if (input.organizationUserId) {
    params.push(input.organizationUserId);
    filters.push(`ou.id = $${params.length}`);
  }

  const result = await client.query<{
    id: string;
    name: string;
    role: string | null;
    order_count: string;
    won_count: string;
    won_value: string;
    open_value: string;
  }>(
    `
      select
        ou.id::text as id,
        coalesce(nullif(trim(ou.full_name), ''), ou.email, 'Unassigned') as name,
        ou.role,
        count(so.id)::text as order_count,
        count(so.id) filter (where so.status = 'closed_won')::text as won_count,
        coalesce(sum(so.total_amount) filter (where so.status = 'closed_won'), 0)::text as won_value,
        coalesce(sum(so.total_amount) filter (where so.status = 'open'), 0)::text as open_value
      from organization_users ou
      left join sales_orders so
        on so.assigned_user_id = ou.id
        and so.organization_id = ou.organization_id
      where ${filters.join(" and ")}
      group by ou.id, ou.full_name, ou.email, ou.role
      order by
        coalesce(sum(so.total_amount) filter (where so.status = 'closed_won'), 0) desc,
        count(so.id) filter (where so.status = 'closed_won') desc,
        count(so.id) desc
    `,
    params
  );

  const performers: SalesLeaderboardEntry[] = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    order_count: Number(row.order_count),
    won_count: Number(row.won_count),
    won_value: row.won_value,
    open_value: row.open_value
  }));

  const averageWonCount =
    performers.length > 0
      ? performers.reduce((total, performer) => total + performer.won_count, 0) / performers.length
      : 0;

  return {
    topPerformers: performers.slice(0, 5),
    needsAttention: [...performers]
      .filter((performer) => performer.won_count < averageWonCount)
      .sort((left, right) => left.won_count - right.won_count || Number(left.won_value) - Number(right.won_value))
      .slice(0, 5),
    averageWonCount
  };
}

export class DashboardService {
  private readonly organizationAdminRepository = new OrganizationAdminRepository();

  async getAgentDashboard(authUser: AuthUser, options?: { dateRangeDays?: DashboardDateRangeDays }): Promise<DashboardSummary> {
    if (!authUser.organizationId || !authUser.organizationUserId) {
      throw new Error("organization_id is required");
    }

    const client = await pool.connect();
    try {
      const [assignedConversations, ownedContacts, outboundToday, salesRows] = await Promise.all([
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from conversations
            where organization_id = $1
              and (
                assigned_user_id = $2
                or exists (
                  select 1
                  from conversation_assignments ca
                  where ca.conversation_id = conversations.id
                    and ca.organization_user_id = $2
                )
              )
          `,
          [authUser.organizationId, authUser.organizationUserId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from contacts
            where organization_id = $1
              and (
                owner_user_id = $2
                or exists (
                  select 1
                  from contact_owners co
                  where co.contact_id = contacts.id
                    and co.organization_user_id = $2
                )
              )
          `,
          [authUser.organizationId, authUser.organizationUserId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from messages
            where organization_id = $1
              and direction = 'outgoing'
              and sent_at >= date_trunc('day', timezone('utc', now()))
              and conversation_id in (
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
              )
          `,
          [authUser.organizationId, authUser.organizationUserId]
        ),
        client.query<{ status: string; count: string; value: string }>(
          `
            select
              so.status,
              count(*)::text as count,
              coalesce(sum(so.total_amount), 0)::text as value
            from sales_orders so
            where so.organization_id = $1
              and so.assigned_user_id = $2
            group by so.status
          `,
          [authUser.organizationId, authUser.organizationUserId]
        )
      ]);

      const salesByStatus = new Map(salesRows.rows.map((row) => [row.status, row]));
      const createdOrderTrendRows = await client.query<{ bucket_start: string; count: string }>(
        `
          select
            date_trunc('day', so.created_at) as bucket_start,
            count(*)::text as count
          from sales_orders so
          where so.organization_id = $1
            and so.assigned_user_id = $2
            and so.created_at >= date_trunc('day', timezone('utc', now())) - interval '6 days'
          group by 1
          order by 1 asc
        `,
        [authUser.organizationId, authUser.organizationUserId]
      );
      const wonRevenueTrendRows = await client.query<{ bucket_start: string; value: string }>(
        `
          select
            date_trunc('day', so.closed_at) as bucket_start,
            coalesce(sum(so.total_amount), 0)::text as value
          from sales_orders so
          where so.organization_id = $1
            and so.assigned_user_id = $2
            and so.status = 'closed_won'
            and so.closed_at is not null
            and so.closed_at >= date_trunc('day', timezone('utc', now())) - interval '6 days'
          group by 1
          order by 1 asc
        `,
        [authUser.organizationId, authUser.organizationUserId]
      );
      const createdByDay = new Map(createdOrderTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), Number(row.count)]));
      const wonRevenueByDay = new Map(wonRevenueTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), row.value]));
      const leaderboard = authUser.role === "user"
        ? await getSalesLeaderboard(client, {
            organizationId: authUser.organizationId,
            organizationUserId: authUser.organizationUserId
          })
        : null;

      const dashboard: DashboardSummary = {
        scope: "agent",
        metrics: [
          {
            label: "Assigned conversations",
            value: Number(assignedConversations.rows[0]?.count ?? 0),
            hint: "Threads currently routed to you"
          },
          {
            label: "Owned contacts",
            value: Number(ownedContacts.rows[0]?.count ?? 0),
            hint: "Canonical contacts you are responsible for"
          },
          {
            label: "Outbound today",
            value: Number(outboundToday.rows[0]?.count ?? 0),
            hint: "Messages sent from your assigned threads today"
          }
        ],
        sales: {
          title: "My sales pipeline",
          stats: [
            {
              label: "Open orders",
              value: Number(salesByStatus.get("open")?.count ?? 0),
              hint: "Assigned orders still in progress",
              href: "/sales?status=open"
            },
            {
              label: "Won value",
              value: `MYR ${Number(salesByStatus.get("closed_won")?.value ?? 0).toFixed(2)}`,
              hint: "Closed-won value across your assigned orders",
              href: "/sales?status=closed_won"
            },
            {
              label: "Lost orders",
              value: Number(salesByStatus.get("closed_lost")?.count ?? 0),
              hint: "Assigned orders marked as lost",
              href: "/sales?status=closed_lost"
            }
          ],
          pipeline: ["open", "closed_won", "closed_lost"].map((status) => ({
            status,
            count: Number(salesByStatus.get(status)?.count ?? 0),
            value: String(salesByStatus.get(status)?.value ?? "0"),
            href: `/sales?status=${status}`
          })),
          trends: buildDailyRanges(7).flatMap((range) => [
            {
              label: `${range.label} created`,
              metric: "created_orders" as const,
              value: createdByDay.get(range.range_start) ?? 0,
              range_start: range.range_start,
              range_end: range.range_end,
              href: `/sales?created_from=${encodeURIComponent(range.range_start)}&created_to=${encodeURIComponent(range.range_end)}`
            },
            {
              label: `${range.label} won`,
              metric: "won_revenue" as const,
              value: `MYR ${Number(wonRevenueByDay.get(range.range_start) ?? 0).toFixed(2)}`,
              range_start: range.range_start,
              range_end: range.range_end,
              href: `/sales?status=closed_won&closed_from=${encodeURIComponent(range.range_start)}&closed_to=${encodeURIComponent(range.range_end)}`
            }
          ]),
          ...(leaderboard
            ? {
                leaderboard: leaderboard.topPerformers,
                leaderboard_attention: leaderboard.needsAttention,
                leaderboard_average_won_count: leaderboard.averageWonCount
              }
            : {})
        }
      };

      return this.withOrganizationWidgets(dashboard, authUser, client, "agent", normalizeDashboardDateRangeDays(options?.dateRangeDays));
    } finally {
      client.release();
    }
  }

  async getAdminDashboard(
    authUser: AuthUser,
    organizationIdOverride?: string | null,
    options?: { dateRangeDays?: DashboardDateRangeDays }
  ): Promise<DashboardSummary> {
    const organizationId = authUser.role === "super_admin" ? organizationIdOverride ?? authUser.organizationId : authUser.organizationId;
    const scopedAuthUser = { ...authUser, organizationId };

    if (!organizationId) {
      throw new Error("organization_id is required");
    }

    const client = await pool.connect();
    try {
      const [contacts, openConversations, messagesToday, activeAccounts, salesRows, leadRows] = await Promise.all([
        client.query<{ count: string }>(
          "select count(*)::text as count from contacts where organization_id = $1",
          [organizationId]
        ),
        client.query<{ count: string }>(
          "select count(*)::text as count from conversations where organization_id = $1 and status = 'open'",
          [organizationId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from messages
            where organization_id = $1
              and sent_at >= date_trunc('day', timezone('utc', now()))
          `,
          [organizationId]
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
        client.query<{ status: string; count: string; value: string }>(
          `
            select
              so.status,
              count(*)::text as count,
              coalesce(sum(so.total_amount), 0)::text as value
            from sales_orders so
            where so.organization_id = $1
            group by so.status
          `,
          [organizationId]
        ),
        client.query<{ status: string; count: string }>(
          `
            select
              l.status,
              count(*)::text as count
            from leads l
            where l.organization_id = $1
            group by l.status
          `,
          [organizationId]
        )
      ]);

      const salesByStatus = new Map(salesRows.rows.map((row) => [row.status, row]));
      const leadsByStatus = new Map(leadRows.rows.map((row) => [row.status, row]));
      const createdOrderTrendRows = await client.query<{ bucket_start: string; count: string }>(
        `
          select
            date_trunc('day', so.created_at) as bucket_start,
            count(*)::text as count
          from sales_orders so
          where so.organization_id = $1
            and so.created_at >= date_trunc('day', timezone('utc', now())) - interval '6 days'
          group by 1
          order by 1 asc
        `,
        [organizationId]
      );
      const wonRevenueTrendRows = await client.query<{ bucket_start: string; value: string }>(
        `
          select
            date_trunc('day', so.closed_at) as bucket_start,
            coalesce(sum(so.total_amount), 0)::text as value
          from sales_orders so
          where so.organization_id = $1
            and so.status = 'closed_won'
            and so.closed_at is not null
            and so.closed_at >= date_trunc('day', timezone('utc', now())) - interval '6 days'
          group by 1
          order by 1 asc
        `,
        [organizationId]
      );
      const createdByDay = new Map(createdOrderTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), Number(row.count)]));
      const wonRevenueByDay = new Map(wonRevenueTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), row.value]));
      const leaderboard = authUser.role === "org_admin"
        ? await getSalesLeaderboard(client, { organizationId })
        : null;

      const dashboard: DashboardSummary = {
        scope: "admin",
        metrics: [
          {
            label: "Total contacts",
            value: Number(contacts.rows[0]?.count ?? 0),
            hint: "Canonical contacts in this organization"
          },
          {
            label: "Open conversations",
            value: Number(openConversations.rows[0]?.count ?? 0),
            hint: "Live WhatsApp threads waiting on action"
          },
          {
            label: "Messages today",
            value: Number(messagesToday.rows[0]?.count ?? 0),
            hint: "Inbound and outbound messages since midnight UTC"
          },
          {
            label: "Active accounts",
            value: Number(activeAccounts.rows[0]?.count ?? 0),
            hint: "WhatsApp accounts with an active or recovering session"
          }
        ],
        sales: {
          title: "Organization revenue pipeline",
          stats: [
            {
              label: "Open pipeline",
              value: `MYR ${Number(salesByStatus.get("open")?.value ?? 0).toFixed(2)}`,
              hint: "Current open order value",
              href: "/sales?status=open"
            },
            {
              label: "Won revenue",
              value: `MYR ${Number(salesByStatus.get("closed_won")?.value ?? 0).toFixed(2)}`,
              hint: "Closed-won order value",
              href: "/sales?status=closed_won"
            },
            {
              label: "Active leads",
              value:
                Number(leadsByStatus.get("new_lead")?.count ?? 0) +
                Number(leadsByStatus.get("contacted")?.count ?? 0) +
                Number(leadsByStatus.get("interested")?.count ?? 0) +
                Number(leadsByStatus.get("processing")?.count ?? 0),
              hint: "Leads still moving through the funnel"
            }
          ],
          pipeline: ["open", "closed_won", "closed_lost"].map((status) => ({
            status,
            count: Number(salesByStatus.get(status)?.count ?? 0),
            value: String(salesByStatus.get(status)?.value ?? "0"),
            href: `/sales?status=${status}`
          })),
          trends: buildDailyRanges(7).flatMap((range) => [
            {
              label: `${range.label} created`,
              metric: "created_orders" as const,
              value: createdByDay.get(range.range_start) ?? 0,
              range_start: range.range_start,
              range_end: range.range_end,
              href: `/sales?created_from=${encodeURIComponent(range.range_start)}&created_to=${encodeURIComponent(range.range_end)}`
            },
            {
              label: `${range.label} won`,
              metric: "won_revenue" as const,
              value: `MYR ${Number(wonRevenueByDay.get(range.range_start) ?? 0).toFixed(2)}`,
              range_start: range.range_start,
              range_end: range.range_end,
              href: `/sales?status=closed_won&closed_from=${encodeURIComponent(range.range_start)}&closed_to=${encodeURIComponent(range.range_end)}`
            }
          ]),
          ...(leaderboard
            ? {
                leaderboard: leaderboard.topPerformers,
                leaderboard_attention: leaderboard.needsAttention,
                leaderboard_average_won_count: leaderboard.averageWonCount
              }
            : {})
        }
      };

      return this.withOrganizationWidgets(dashboard, scopedAuthUser, client, "admin", normalizeDashboardDateRangeDays(options?.dateRangeDays));
    } finally {
      client.release();
    }
  }

  async getSuperAdminDashboard(options?: { dateRangeDays?: DashboardDateRangeDays }): Promise<DashboardSummary> {
    const client = await pool.connect();
    try {
      const [organizations, organizationRows, users, accounts, salesRows] = await Promise.all([
        client.query<{ count: string }>("select count(*)::text as count from organizations"),
        this.organizationAdminRepository.list(client),
        client.query<{ count: string }>("select count(*)::text as count from organization_users where status = 'active'"),
        client.query<{ count: string }>(
          "select count(*)::text as count from whatsapp_accounts where connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required')"
        ),
        client.query<{ status: string; count: string; value: string }>(
          `
            select
              so.status,
              count(*)::text as count,
              coalesce(sum(so.total_amount), 0)::text as value
            from sales_orders so
            group by so.status
          `
        )
      ]);

      const activeOrganizations = organizationRows.filter((organization) =>
        ["active", "trial"].includes(organization.status)
      ).length;
      const salesByStatus = new Map(salesRows.rows.map((row) => [row.status, row]));
      const createdOrderTrendRows = await client.query<{ bucket_start: string; count: string }>(
        `
          select
            date_trunc('day', so.created_at) as bucket_start,
            count(*)::text as count
          from sales_orders so
          where so.created_at >= date_trunc('day', timezone('utc', now())) - interval '6 days'
          group by 1
          order by 1 asc
        `
      );
      const wonRevenueTrendRows = await client.query<{ bucket_start: string; value: string }>(
        `
          select
            date_trunc('day', so.closed_at) as bucket_start,
            coalesce(sum(so.total_amount), 0)::text as value
          from sales_orders so
          where so.status = 'closed_won'
            and so.closed_at is not null
            and so.closed_at >= date_trunc('day', timezone('utc', now())) - interval '6 days'
          group by 1
          order by 1 asc
        `
      );
      const createdByDay = new Map(createdOrderTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), Number(row.count)]));
      const wonRevenueByDay = new Map(wonRevenueTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), row.value]));
      const dashboard: DashboardSummary = {
        scope: "super_admin",
        metrics: [
          {
            label: "Organizations",
            value: Number(organizations.rows[0]?.count ?? 0),
            hint: "Total tenants registered on the platform"
          },
          {
            label: "Active tenants",
            value: activeOrganizations,
            hint: "Organizations in active or trial status"
          },
          {
            label: "Active users",
            value: Number(users.rows[0]?.count ?? 0),
            hint: "Organization users with active access"
          },
          {
            label: "Healthy accounts",
            value: Number(accounts.rows[0]?.count ?? 0),
            hint: "WhatsApp accounts with a live or recovering session"
          }
        ],
        sales: {
          title: "Platform sales rollup",
          stats: [
            {
              label: "Open pipeline",
              value: `MYR ${Number(salesByStatus.get("open")?.value ?? 0).toFixed(2)}`,
              hint: "Open order value across all tenants",
              href: "/sales?status=open"
            },
            {
              label: "Won revenue",
              value: `MYR ${Number(salesByStatus.get("closed_won")?.value ?? 0).toFixed(2)}`,
              hint: "Closed-won order value across the platform",
              href: "/sales?status=closed_won"
            },
            {
              label: "Won orders",
              value: Number(salesByStatus.get("closed_won")?.count ?? 0),
              hint: "Total converted orders across tenants",
              href: "/sales?status=closed_won"
            }
          ],
          pipeline: ["open", "closed_won", "closed_lost"].map((status) => ({
            status,
            count: Number(salesByStatus.get(status)?.count ?? 0),
            value: String(salesByStatus.get(status)?.value ?? "0"),
            href: `/sales?status=${status}`
          })),
          trends: buildDailyRanges(7).flatMap((range) => [
            {
              label: `${range.label} created`,
              metric: "created_orders" as const,
              value: createdByDay.get(range.range_start) ?? 0,
              range_start: range.range_start,
              range_end: range.range_end,
              href: `/sales?created_from=${encodeURIComponent(range.range_start)}&created_to=${encodeURIComponent(range.range_end)}`
            },
            {
              label: `${range.label} won`,
              metric: "won_revenue" as const,
              value: `MYR ${Number(wonRevenueByDay.get(range.range_start) ?? 0).toFixed(2)}`,
              range_start: range.range_start,
              range_end: range.range_end,
              href: `/sales?status=closed_won&closed_from=${encodeURIComponent(range.range_start)}&closed_to=${encodeURIComponent(range.range_end)}`
            }
          ]),
        }
      };

      return this.withPlatformWidgets(dashboard, client, normalizeDashboardDateRangeDays(options?.dateRangeDays));
    } finally {
      client.release();
    }
  }

  private async getDashboardAnalytics(
    client: PoolClient,
    input: {
      organizationId: string | null;
      authUser: AuthUser | null;
      scope: DashboardScope;
      dateRangeDays: DashboardDateRangeDays;
      enabledModuleKeys: Set<string>;
    }
  ): Promise<DashboardAnalytics> {
    const dailyRanges = buildDailyRanges(input.dateRangeDays);
    const rangeStart = dailyRanges[0]?.range_start ?? new Date().toISOString();
    const rangeEnd = dailyRanges[dailyRanges.length - 1]?.range_end ?? new Date().toISOString();
    const assignedOnly = input.scope === "agent" && Boolean(input.authUser?.organizationUserId);
    const organizationUserId = input.authUser?.organizationUserId ?? null;
    const canShow = (moduleKey: string) => input.scope === "super_admin" || input.enabledModuleKeys.has(moduleKey);
    const baseScopedParams = [input.organizationId, organizationUserId, rangeStart, rangeEnd, assignedOnly] as const;

    const [
      contactGrowthRows,
      conversationStatusRows,
      campaignTrendRows,
      campaignFunnelRows,
      leadStatusRows,
      messageUsageRows,
      salesUsageRows,
      campaignUsageRows,
      emailUsageRows,
      aiUsageRows
    ] = await Promise.all([
      canShow("crm")
        ? client.query<{ bucket_start: string; count: string }>(
            `
              select date_trunc('day', c.created_at) as bucket_start, count(*)::text as count
              from contacts c
              where ($1::uuid is null or c.organization_id = $1)
                and c.deleted_at is null
                and c.created_at >= $3::timestamptz
                and c.created_at < $4::timestamptz
                and (
                  not $5::boolean
                  or c.owner_user_id = $2
                  or exists (
                    select 1
                    from contact_owners co
                    where co.contact_id = c.id
                      and co.organization_user_id = $2
                  )
                )
              group by 1
              order by 1 asc
            `,
            [...baseScopedParams]
          )
        : Promise.resolve({ rows: [] }),
      canShow("inbox")
        ? client.query<{ status: string; count: string }>(
            `
              select c.status, count(*)::text as count
              from conversations c
              where ($1::uuid is null or c.organization_id = $1)
                and c.deleted_at is null
                and (
                  not $3::boolean
                  or c.assigned_user_id = $2
                  or exists (
                    select 1
                    from conversation_assignments ca
                    where ca.conversation_id = c.id
                      and ca.organization_user_id = $2
                  )
                )
              group by c.status
              order by c.status asc
            `,
            [input.organizationId, organizationUserId, assignedOnly]
          )
        : Promise.resolve({ rows: [] }),
      canShow("campaign.whatsapp")
        ? safeQuery<{ bucket_start: string; sent_count: string; failed_count: string }>(
            client,
            `
              select
                bucket_start::text as bucket_start,
                sum(sent_count)::text as sent_count,
                sum(failed_count)::text as failed_count
              from (
                select date_trunc('day', sent_at) as bucket_start, count(*)::integer as sent_count, 0::integer as failed_count
                from campaign_recipients
                where ($1::uuid is null or organization_id = $1)
                  and sent_at is not null
                  and sent_at >= $2::timestamptz
                  and sent_at < $3::timestamptz
                group by 1

                union all

                select date_trunc('day', failed_at) as bucket_start, 0::integer as sent_count, count(*)::integer as failed_count
                from campaign_recipients
                where ($1::uuid is null or organization_id = $1)
                  and failed_at is not null
                  and failed_at >= $2::timestamptz
                  and failed_at < $3::timestamptz
                group by 1
              ) campaign_activity
              group by bucket_start
              order by bucket_start asc
            `,
            [input.organizationId, rangeStart, rangeEnd],
            []
          )
        : Promise.resolve([]),
      canShow("campaign.whatsapp")
        ? safeQuery<{ send_status: string; count: string }>(
            client,
            `
              select send_status, count(*)::text as count
              from campaign_recipients
              where ($1::uuid is null or organization_id = $1)
              group by send_status
              order by send_status asc
            `,
            [input.organizationId],
            []
          )
        : Promise.resolve([]),
      canShow("sales")
        ? client.query<{ status: string; count: string }>(
            `
              select l.status, count(*)::text as count
              from leads l
              where ($1::uuid is null or l.organization_id = $1)
                and (
                  not $3::boolean
                  or l.assigned_user_id = $2
                )
              group by l.status
              order by l.status asc
            `,
            [input.organizationId, organizationUserId, assignedOnly]
          )
        : Promise.resolve({ rows: [] }),
      canShow("inbox")
        ? client.query<{ count: string }>(
            `
              select count(*)::text as count
              from messages m
              where ($1::uuid is null or m.organization_id = $1)
                and m.sent_at >= $3::timestamptz
                and m.sent_at < $4::timestamptz
                and (
                  not $5::boolean
                  or m.conversation_id in (
                    select c.id
                    from conversations c
                    where c.organization_id = m.organization_id
                      and (
                        c.assigned_user_id = $2
                        or exists (
                          select 1
                          from conversation_assignments ca
                          where ca.conversation_id = c.id
                            and ca.organization_user_id = $2
                        )
                      )
                  )
                )
            `,
            [...baseScopedParams]
          )
        : Promise.resolve({ rows: [{ count: "0" }] }),
      canShow("sales")
        ? client.query<{ count: string }>(
            `
              select count(*)::text as count
              from sales_orders so
              where ($1::uuid is null or so.organization_id = $1)
                and so.created_at >= $3::timestamptz
                and so.created_at < $4::timestamptz
                and (
                  not $5::boolean
                  or so.assigned_user_id = $2
                )
            `,
            [...baseScopedParams]
          )
        : Promise.resolve({ rows: [{ count: "0" }] }),
      canShow("campaign.whatsapp")
        ? safeQuery<{ count: string }>(
            client,
            `
              select count(*)::text as count
              from campaign_recipients
              where ($1::uuid is null or organization_id = $1)
                and coalesce(sent_at, failed_at, queued_at, created_at) >= $2::timestamptz
                and coalesce(sent_at, failed_at, queued_at, created_at) < $3::timestamptz
            `,
            [input.organizationId, rangeStart, rangeEnd],
            [{ count: "0" }]
          )
        : Promise.resolve([{ count: "0" }]),
      canShow("campaign.email")
        ? safeQuery<{ count: string }>(
            client,
            `
              select count(*)::text as count
              from email_campaign_recipients
              where ($1::uuid is null or organization_id = $1)
                and coalesce(sent_at, created_at) >= $2::timestamptz
                and coalesce(sent_at, created_at) < $3::timestamptz
            `,
            [input.organizationId, rangeStart, rangeEnd],
            [{ count: "0" }]
          )
        : Promise.resolve([{ count: "0" }]),
      canShow("ai")
        ? safeQuery<{ count: string }>(
            client,
            `
              select count(*)::text as count
              from ai_usage_events
              where ($1::uuid is null or organization_id = $1)
                and created_at >= $2::timestamptz
                and created_at < $3::timestamptz
            `,
            [input.organizationId, rangeStart, rangeEnd],
            [{ count: "0" }]
          )
        : Promise.resolve([{ count: "0" }])
    ]);

    const contactGrowthPoints = dailyRanges.map((range) => {
      const row = contactGrowthRows.rows.find((entry) => new Date(entry.bucket_start).toISOString() === range.range_start);
      return {
        key: range.range_start,
        label: range.label,
        value: Number(row?.count ?? 0),
        href: `/contacts?created_from=${encodeURIComponent(range.range_start)}&created_to=${encodeURIComponent(range.range_end)}`
      };
    });

    const campaignPerformancePoints = dailyRanges.map((range) => {
      const row = campaignTrendRows.find((entry) => new Date(entry.bucket_start).toISOString() === range.range_start);
      return {
        key: range.range_start,
        label: range.label,
        value: Number(row?.sent_count ?? 0),
        secondaryValue: Number(row?.failed_count ?? 0),
        href: `/campaigns`
      };
    });

    const conversationStatusSegments = conversationStatusRows.rows
      .map((row) => buildConversationStatusSegment(row.status, Number(row.count)))
      .filter((segment) => segment.value > 0);

    const campaignFunnelSegments = campaignFunnelRows
      .map((row) => buildCampaignFunnelSegment(row.send_status, Number(row.count)))
      .filter((segment) => segment.value > 0);

    const leadStatusCounts = new Map(leadStatusRows.rows.map((row) => [row.status, Number(row.count)]));
    const followUpHealthSegments = canShow("sales")
      ? [
          { key: "new_lead", label: "Needs first touch", value: leadStatusCounts.get("new_lead") ?? 0, href: "/leads", tone: "warning" as const },
          {
            key: "active_follow_up",
            label: "Active follow-up",
            value:
              (leadStatusCounts.get("contacted") ?? 0) +
              (leadStatusCounts.get("interested") ?? 0) +
              (leadStatusCounts.get("processing") ?? 0),
            href: "/leads",
            tone: "primary" as const
          },
          { key: "closed_won", label: "Won", value: leadStatusCounts.get("closed_won") ?? 0, href: "/sales?status=closed_won", tone: "success" as const },
          { key: "closed_lost", label: "Lost", value: leadStatusCounts.get("closed_lost") ?? 0, href: "/sales?status=closed_lost", tone: "danger" as const }
        ].filter((segment) => segment.value > 0)
      : [];

    const moduleUsageSegments: DashboardBreakdownSegment[] = [];
    if (canShow("inbox")) {
      const value = Number(messageUsageRows.rows[0]?.count ?? 0);
      if (value > 0) {
        moduleUsageSegments.push({ key: "inbox", label: "Inbox", value, href: "/inbox/whatsapp", tone: "primary" });
      }
    }
    if (canShow("crm")) {
      const value = contactGrowthPoints.reduce((total, point) => total + point.value, 0);
      if (value > 0) {
        moduleUsageSegments.push({ key: "crm", label: "CRM", value, href: "/contacts", tone: "success" });
      }
    }
    if (canShow("sales")) {
      const value = Number(salesUsageRows.rows[0]?.count ?? 0);
      if (value > 0) {
        moduleUsageSegments.push({ key: "sales", label: "Sales", value, href: "/sales", tone: "warning" });
      }
    }
    if (canShow("campaign.whatsapp")) {
      const value = Number(campaignUsageRows[0]?.count ?? 0);
      if (value > 0) {
        moduleUsageSegments.push({ key: "campaign.whatsapp", label: "WA Campaigns", value, href: "/campaigns", tone: "danger" });
      }
    }
    if (canShow("campaign.email")) {
      const value = Number(emailUsageRows[0]?.count ?? 0);
      if (value > 0) {
        moduleUsageSegments.push({ key: "campaign.email", label: "Email", value, href: "/campaigns/email", tone: "neutral" });
      }
    }
    if (canShow("ai")) {
      const value = Number(aiUsageRows[0]?.count ?? 0);
      if (value > 0) {
        moduleUsageSegments.push({ key: "ai", label: "AI Assist", value, href: "/inbox/whatsapp", tone: "primary" });
      }
    }

    return {
      dateRangeDays: input.dateRangeDays,
      availableDateRanges: [7, 30, 90],
      ...(canShow("campaign.whatsapp")
        ? {
            campaignPerformanceTrend: {
              title: "Campaign Performance Trend",
              description: `Sent versus failed campaign recipients across the last ${input.dateRangeDays} days.`,
              points: campaignPerformancePoints
            },
            campaignFunnel: {
              title: "Campaign Funnel",
              description: "Current recipient delivery state across queued, sent, failed, and skipped recipients.",
              segments: campaignFunnelSegments
            }
          }
        : {}),
      ...(canShow("crm")
        ? {
            contactGrowthTrend: {
              title: "Contact Growth Trend",
              description: `New contacts created across the last ${input.dateRangeDays} days.`,
              points: contactGrowthPoints
            }
          }
        : {}),
      ...(canShow("inbox")
        ? {
            conversationStatusBreakdown: {
              title: "Conversation Status Breakdown",
              description: "Live conversation mix for the current scoped inbox.",
              segments: conversationStatusSegments
            }
          }
        : {}),
      ...(canShow("sales")
        ? {
            followUpHealth: {
              title: "Follow-up Health",
              description: "Lead distribution from first touch through won and lost outcomes.",
              segments: followUpHealthSegments
            }
          }
        : {}),
      ...(moduleUsageSegments.length > 0
        ? {
            moduleUsageOverview: {
              title: "Module Usage Overview",
              description: `Recent record activity by module over the last ${input.dateRangeDays} days.`,
              segments: moduleUsageSegments
            }
          }
        : {})
    };
  }

  private async withOrganizationWidgets(
    dashboard: DashboardSummary,
    authUser: AuthUser,
    client: PoolClient,
    scope: Exclude<DashboardScope, "super_admin">,
    dateRangeDays: DashboardDateRangeDays
  ): Promise<DashboardSummary> {
    if (!authUser.organizationId) {
      return {
        ...dashboard,
        organizationId: null,
        generatedAt: new Date().toISOString(),
        summary: {
          title: "Organization Command Center",
          subtitle: "No organization is attached to this session.",
          healthStatus: "unknown",
          activeModuleCount: 0,
          alertCount: 0
        },
        enabledModules: [],
        widgets: []
      };
    }

    const generatedAt = new Date().toISOString();
    const enabledModules = await this.getEnabledOrganizationModules(client, authUser.organizationId);
    const widgets: DashboardWidget[] = [];

    const setupWidget = await setupHealthDashboardProvider.getWidget(authUser, client, {
      organizationId: authUser.organizationId,
      scope,
      generatedAt
    });
    if (setupWidget.status === "critical" || setupWidget.status === "warning") {
      widgets.push(setupWidget);
    }

    for (const provider of ORGANIZATION_DASHBOARD_PROVIDERS) {
      if (!enabledModules.has(provider.moduleKey)) {
        continue;
      }

      widgets.push(
        await provider.getWidget(authUser, client, {
          organizationId: authUser.organizationId,
          scope,
          generatedAt
        })
      );
    }

    const analytics = await this.getDashboardAnalytics(client, {
      organizationId: authUser.organizationId,
      authUser,
      scope,
      dateRangeDays,
      enabledModuleKeys: enabledModules
    });

    return this.withDashboardEnvelope(dashboard, {
      organizationId: authUser.organizationId,
      generatedAt,
      title: "Organization Command Center",
      subtitle: "Module-aware overview for the features enabled on this organization.",
      activeModuleCount: enabledModules.size,
      enabledModules: Array.from(enabledModules).sort(),
      widgets,
      analytics
    });
  }

  private async withPlatformWidgets(
    dashboard: DashboardSummary,
    client: PoolClient,
    dateRangeDays: DashboardDateRangeDays
  ): Promise<DashboardSummary> {
    const generatedAt = new Date().toISOString();
    const widget = await platformDashboardProvider.getWidget(
      {
        authUserId: "platform",
        organizationUserId: null,
        organizationId: null,
        organizationName: null,
        role: "super_admin",
        email: "",
        fullName: null,
        avatarUrl: null,
        permissionKeys: []
      },
      client,
      {
        organizationId: null,
        scope: "super_admin",
        generatedAt
      }
    );

    const analytics = await this.getDashboardAnalytics(client, {
      organizationId: null,
      authUser: null,
      scope: "super_admin",
      dateRangeDays,
      enabledModuleKeys: new Set(["inbox", "crm", "sales", "campaign.whatsapp", "campaign.email", "ai", "platform"])
    });

    return this.withDashboardEnvelope(dashboard, {
      organizationId: null,
      generatedAt,
      title: "Platform Command Center",
      subtitle: "Cross-organization platform health and usage signals.",
      activeModuleCount: 1,
      enabledModules: ["platform"],
      widgets: [widget],
      analytics
    });
  }

  private withDashboardEnvelope(
    dashboard: DashboardSummary,
    input: {
      organizationId: string | null;
      generatedAt: string;
      title: string;
      subtitle: string;
      activeModuleCount: number;
      enabledModules: string[];
      widgets: DashboardWidget[];
      analytics?: DashboardAnalytics;
    }
  ): DashboardSummary {
    const widgets = input.widgets.slice().sort((left, right) => left.priority - right.priority);
    const alertCount = widgets.reduce((total, widget) => total + widget.alerts.length, 0);

    return {
      ...dashboard,
      organizationId: input.organizationId,
      generatedAt: input.generatedAt,
      enabledModules: input.enabledModules,
      analytics: input.analytics,
      summary: {
        title: input.title,
        subtitle: input.subtitle,
        healthStatus: getDashboardHealthStatus(widgets),
        activeModuleCount: input.activeModuleCount,
        alertCount
      },
      widgets
    };
  }

  private async getEnabledOrganizationModules(client: PoolClient, organizationId: string) {
    const moduleKeys = ORGANIZATION_DASHBOARD_PROVIDERS.map((provider) => provider.moduleKey);
    const lookupKeys = [
      ...new Set([
        ...moduleKeys,
        ...ORGANIZATION_DASHBOARD_PROVIDERS.flatMap((provider) => provider.moduleAliases ?? []),
        LEGACY_CAMPAIGNS_MODULE_KEY,
        CAMPAIGN_MODULE_KEY
      ])
    ];
    const result = await client.query<{ module_key: string; is_enabled: boolean }>(
      `
        select module_key, is_enabled
        from organization_modules
        where organization_id = $1
          and module_key = any($2::text[])
      `,
      [organizationId, lookupKeys]
    );
    const rowsByKey = new Map(result.rows.map((row) => [row.module_key, row.is_enabled]));
    const enabledModules = new Set<string>();

    for (const moduleKey of moduleKeys) {
      const explicitValue = rowsByKey.get(moduleKey);
      if (explicitValue === true || (typeof explicitValue === "undefined" && CORE_DEFAULT_MODULE_KEYS.has(moduleKey))) {
        enabledModules.add(moduleKey);
      }
    }

    for (const provider of ORGANIZATION_DASHBOARD_PROVIDERS) {
      if (provider.moduleAliases?.some((alias) => rowsByKey.get(alias) === true)) {
        enabledModules.add(provider.moduleKey);
      }
    }

    if (rowsByKey.get(CAMPAIGN_MODULE_KEY) === true || rowsByKey.get(LEGACY_CAMPAIGNS_MODULE_KEY) === true) {
      for (const campaignModuleKey of CAMPAIGN_CHILD_MODULE_KEYS) {
        enabledModules.add(campaignModuleKey);
      }
    }

    return enabledModules;
  }
}

function getDashboardHealthStatus(widgets: DashboardWidget[]): "healthy" | "warning" | "critical" | "unknown" {
  if (widgets.length === 0) {
    return "unknown";
  }

  const statuses = new Set<DashboardWidgetStatus>(widgets.map((widget) => widget.status));
  if (statuses.has("critical")) {
    return "critical";
  }
  if (statuses.has("warning")) {
    return "warning";
  }
  return "healthy";
}

function buildConversationStatusSegment(status: string, value: number): DashboardBreakdownSegment {
  switch (status) {
    case "open":
      return { key: status, label: "Open", value, href: "/inbox/whatsapp?status=open", tone: "primary" };
    case "closed":
      return { key: status, label: "Closed", value, href: "/inbox/whatsapp?status=closed", tone: "success" };
    case "pending":
      return { key: status, label: "Pending", value, href: "/inbox/whatsapp?status=pending", tone: "warning" };
    default:
      return {
        key: status,
        label: status
          .split(/[_-]/g)
          .filter(Boolean)
          .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
          .join(" "),
        value,
        href: `/inbox/whatsapp?status=${encodeURIComponent(status)}`,
        tone: "neutral"
      };
  }
}

function buildCampaignFunnelSegment(sendStatus: string, value: number): DashboardBreakdownSegment {
  switch (sendStatus) {
    case "sent":
      return { key: sendStatus, label: "Sent", value, href: "/campaigns", tone: "success" };
    case "failed":
      return { key: sendStatus, label: "Failed", value, href: "/campaigns", tone: "danger" };
    case "queued":
      return { key: sendStatus, label: "Queued", value, href: "/campaigns", tone: "warning" };
    case "pending":
      return { key: sendStatus, label: "Pending", value, href: "/campaigns", tone: "primary" };
    case "skipped":
      return { key: sendStatus, label: "Skipped", value, href: "/campaigns", tone: "neutral" };
    default:
      return { key: sendStatus, label: sendStatus, value, href: "/campaigns", tone: "neutral" };
  }
}
