import { pool } from "../config/database.js";
import { OrganizationAdminRepository } from "../repositories/organizationAdminRepository.js";
import type { AuthUser } from "../types/auth.js";

type DashboardSummary = {
  scope: "agent" | "admin" | "super_admin";
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
  };
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

export class DashboardService {
  private readonly organizationAdminRepository = new OrganizationAdminRepository();

  async getAgentDashboard(authUser: AuthUser): Promise<DashboardSummary> {
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

      return {
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
          ])
        }
      };
    } finally {
      client.release();
    }
  }

  async getAdminDashboard(authUser: AuthUser): Promise<DashboardSummary> {
    if (!authUser.organizationId) {
      throw new Error("organization_id is required");
    }

    const client = await pool.connect();
    try {
      const [contacts, openConversations, messagesToday, activeAccounts, salesRows, leadRows] = await Promise.all([
        client.query<{ count: string }>(
          "select count(*)::text as count from contacts where organization_id = $1",
          [authUser.organizationId]
        ),
        client.query<{ count: string }>(
          "select count(*)::text as count from conversations where organization_id = $1 and status = 'open'",
          [authUser.organizationId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from messages
            where organization_id = $1
              and sent_at >= date_trunc('day', timezone('utc', now()))
          `,
          [authUser.organizationId]
        ),
        client.query<{ count: string }>(
          `
            select count(*)::text as count
            from whatsapp_accounts
            where organization_id = $1
              and connection_status in ('connected', 'reconnecting', 'pairing', 'qr_required')
          `,
          [authUser.organizationId]
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
          [authUser.organizationId]
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
          [authUser.organizationId]
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
        [authUser.organizationId]
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
        [authUser.organizationId]
      );
      const createdByDay = new Map(createdOrderTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), Number(row.count)]));
      const wonRevenueByDay = new Map(wonRevenueTrendRows.rows.map((row) => [new Date(row.bucket_start).toISOString(), row.value]));

      return {
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
          ])
        }
      };
    } finally {
      client.release();
    }
  }

  async getSuperAdminDashboard(): Promise<DashboardSummary> {
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

      return {
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
          ])
        }
      };
    } finally {
      client.release();
    }
  }
}
