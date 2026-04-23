import type { PoolClient } from "pg";

export interface ReportUserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

export interface DailyMetricAggregateRow {
  organization_user_id: string | null;
  report_date: string;
  count_value: number;
  amount_value: string;
}

export class ReportRepository {
  async listActiveUsers(
    client: PoolClient,
    input: {
      organizationId: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
      team?: string | null;
      salesRepId?: string | null;
    }
  ): Promise<ReportUserRow[]> {
    const result = await client.query<ReportUserRow>(
      `
        select
          ou.id,
          ou.full_name,
          ou.email,
          ou.role
        from organization_users ou
        where ou.organization_id = $1
          and ou.status = 'active'
          and ou.role not in ('org_admin', 'super_admin')
          and (
            not $2::boolean
            or ou.id = $3
          )
          and ($4::text is null or ou.role = $4)
          and ($5::uuid is null or ou.id = $5)
        order by coalesce(ou.full_name, ou.email, ou.id::text) asc
      `,
      [
        input.organizationId,
        input.assignedOnly,
        input.organizationUserId ?? null,
        input.team ?? null,
        input.salesRepId ?? null
      ]
    );

    return result.rows;
  }

  async listProductTypes(
    client: PoolClient,
    input: {
      organizationId: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<string[]> {
    const result = await client.query<{ product_type: string }>(
      `
        select distinct trim(soi.product_type) as product_type
        from sales_order_items soi
        join sales_orders so on so.id = soi.sales_order_id
        where so.organization_id = $1
          and soi.product_type is not null
          and trim(soi.product_type) <> ''
          and (
            not $2::boolean
            or so.assigned_user_id = $3
          )
        order by trim(soi.product_type) asc
      `,
      [input.organizationId, input.assignedOnly, input.organizationUserId ?? null]
    );

    return result.rows.map((row) => row.product_type);
  }

  async getSalesAggregates(
    client: PoolClient,
    input: {
      organizationId: string;
      startDate: string;
      endDate: string;
      timezone: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
      productType?: string | null;
    }
  ): Promise<DailyMetricAggregateRow[]> {
    const result = await client.query<DailyMetricAggregateRow>(
      `
        select
          so.assigned_user_id as organization_user_id,
          (so.created_at at time zone $4)::date::text as report_date,
          count(distinct so.id)::integer as count_value,
          coalesce(sum(so.total_amount), 0)::text as amount_value
        from sales_orders so
        where so.organization_id = $1
          and (so.created_at at time zone $4)::date >= $2::date
          and (so.created_at at time zone $4)::date < $3::date
          and (
            not $5::boolean
            or so.assigned_user_id = $6
          )
          and (
            $7::text is null
            or exists (
              select 1
              from sales_order_items soi
              where soi.sales_order_id = so.id
                and trim(soi.product_type) = $7
            )
          )
        group by so.assigned_user_id, (so.created_at at time zone $4)::date
        order by report_date asc
      `,
      [
        input.organizationId,
        input.startDate,
        input.endDate,
        input.timezone,
        input.assignedOnly,
        input.organizationUserId ?? null,
        input.productType ?? null
      ]
    );

    return result.rows;
  }

  async getWonAggregates(
    client: PoolClient,
    input: {
      organizationId: string;
      startDate: string;
      endDate: string;
      timezone: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
      productType?: string | null;
    }
  ): Promise<DailyMetricAggregateRow[]> {
    const result = await client.query<DailyMetricAggregateRow>(
      `
        select
          so.assigned_user_id as organization_user_id,
          (coalesce(so.closed_at, so.updated_at, so.created_at) at time zone $4)::date::text as report_date,
          count(distinct so.id)::integer as count_value,
          coalesce(sum(so.total_amount), 0)::text as amount_value
        from sales_orders so
        where so.organization_id = $1
          and so.status = 'closed_won'
          and (coalesce(so.closed_at, so.updated_at, so.created_at) at time zone $4)::date >= $2::date
          and (coalesce(so.closed_at, so.updated_at, so.created_at) at time zone $4)::date < $3::date
          and (
            not $5::boolean
            or so.assigned_user_id = $6
          )
          and (
            $7::text is null
            or exists (
              select 1
              from sales_order_items soi
              where soi.sales_order_id = so.id
                and trim(soi.product_type) = $7
            )
          )
        group by so.assigned_user_id, (coalesce(so.closed_at, so.updated_at, so.created_at) at time zone $4)::date
        order by report_date asc
      `,
      [
        input.organizationId,
        input.startDate,
        input.endDate,
        input.timezone,
        input.assignedOnly,
        input.organizationUserId ?? null,
        input.productType ?? null
      ]
    );

    return result.rows;
  }

  async getLeadAggregates(
    client: PoolClient,
    input: {
      organizationId: string;
      startDate: string;
      endDate: string;
      timezone: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<DailyMetricAggregateRow[]> {
    const result = await client.query<DailyMetricAggregateRow>(
      `
        select
          l.assigned_user_id as organization_user_id,
          (l.created_at at time zone $4)::date::text as report_date,
          count(*)::integer as count_value,
          '0'::text as amount_value
        from leads l
        where l.organization_id = $1
          and (l.created_at at time zone $4)::date >= $2::date
          and (l.created_at at time zone $4)::date < $3::date
          and (
            not $5::boolean
            or l.assigned_user_id = $6
          )
        group by l.assigned_user_id, (l.created_at at time zone $4)::date
        order by report_date asc
      `,
      [
        input.organizationId,
        input.startDate,
        input.endDate,
        input.timezone,
        input.assignedOnly,
        input.organizationUserId ?? null
      ]
    );

    return result.rows;
  }

  async getContactedAggregates(
    client: PoolClient,
    input: {
      organizationId: string;
      startDate: string;
      endDate: string;
      timezone: string;
      assignedOnly: boolean;
      organizationUserId?: string | null;
    }
  ): Promise<DailyMetricAggregateRow[]> {
    const result = await client.query<DailyMetricAggregateRow>(
      `
        select
          l.assigned_user_id as organization_user_id,
          (l.updated_at at time zone $4)::date::text as report_date,
          count(*)::integer as count_value,
          '0'::text as amount_value
        from leads l
        where l.organization_id = $1
          and l.status in ('contacted', 'interested', 'processing', 'closed_won', 'closed_lost')
          and (l.updated_at at time zone $4)::date >= $2::date
          and (l.updated_at at time zone $4)::date < $3::date
          and (
            not $5::boolean
            or l.assigned_user_id = $6
          )
        group by l.assigned_user_id, (l.updated_at at time zone $4)::date
        order by report_date asc
      `,
      [
        input.organizationId,
        input.startDate,
        input.endDate,
        input.timezone,
        input.assignedOnly,
        input.organizationUserId ?? null
      ]
    );

    return result.rows;
  }
}
