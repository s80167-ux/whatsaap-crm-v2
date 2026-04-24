import type { PoolClient } from "pg";

export interface QuickReplyTemplateRow {
  id: string;
  organization_id: string;
  title: string;
  body: string;
  category: string | null;
  variable_definitions: Array<{
    key: string;
    default_value?: string | null;
    required: boolean;
  }>;
  is_active: boolean;
  sort_order: number;
  usage_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuickReplyAnalyticsSummaryRow {
  total_templates: number;
  total_sends: number;
  customer_replied_count: number;
  lead_created_count: number;
  order_created_count: number;
  order_closed_won_count: number;
  order_closed_lost_count: number;
}

export interface QuickReplyAnalyticsTemplateRow {
  template_id: string;
  title: string;
  category: string | null;
  usage_count: number;
  send_count: number;
  customer_replied_count: number;
  lead_created_count: number;
  order_created_count: number;
  order_closed_won_count: number;
  order_closed_lost_count: number;
  response_rate: number;
  lead_rate: number;
  win_rate: number;
  last_used_at: string | null;
}

export class QuickReplyRepository {
  async list(
    client: PoolClient,
    input: {
      organizationId: string;
      activeOnly?: boolean;
    }
  ): Promise<QuickReplyTemplateRow[]> {
    const result = await client.query<QuickReplyTemplateRow>(
      `
        select
          id,
          organization_id,
          title,
          body,
          category,
          variable_definitions,
          is_active,
          sort_order,
          usage_count,
          last_used_at,
          created_by,
          created_at,
          updated_at
        from quick_reply_templates
        where organization_id = $1
          and (not $2::boolean or is_active)
        order by sort_order asc, title asc, created_at desc
      `,
      [input.organizationId, input.activeOnly ?? false]
    );

    return result.rows;
  }

  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      title: string;
      body: string;
      category?: string | null;
      variableDefinitions?: Array<{
        key: string;
        default_value?: string | null;
        required: boolean;
      }>;
      isActive?: boolean;
      sortOrder?: number;
      createdBy?: string | null;
    }
  ): Promise<QuickReplyTemplateRow> {
    const result = await client.query<QuickReplyTemplateRow>(
      `
        insert into quick_reply_templates (
          organization_id,
          title,
          body,
          category,
          variable_definitions,
          is_active,
          sort_order,
          created_by
        )
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        returning
          id,
          organization_id,
          title,
          body,
          category,
          variable_definitions,
          is_active,
          sort_order,
          usage_count,
          last_used_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        input.organizationId,
        input.title,
        input.body,
        input.category ?? null,
        JSON.stringify(input.variableDefinitions ?? []),
        input.isActive ?? true,
        input.sortOrder ?? 0,
        input.createdBy ?? null
      ]
    );

    return result.rows[0];
  }

  async update(
    client: PoolClient,
    input: {
      organizationId: string;
      templateId: string;
      title?: string;
      body?: string;
      category?: string | null;
      variableDefinitions?: Array<{
        key: string;
        default_value?: string | null;
        required: boolean;
      }>;
      isActive?: boolean;
      sortOrder?: number;
    }
  ): Promise<QuickReplyTemplateRow | null> {
    const result = await client.query<QuickReplyTemplateRow>(
      `
        update quick_reply_templates
        set title = coalesce($3, title),
            body = coalesce($4, body),
            category = case when $5::boolean then $6 else category end,
            variable_definitions = case when $7::boolean then $8::jsonb else variable_definitions end,
            is_active = coalesce($9, is_active),
            sort_order = coalesce($10, sort_order)
        where organization_id = $1
          and id = $2
        returning
          id,
          organization_id,
          title,
          body,
          category,
          variable_definitions,
          is_active,
          sort_order,
          usage_count,
          last_used_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        input.organizationId,
        input.templateId,
        input.title,
        input.body,
        input.category !== undefined,
        input.category ?? null,
        input.variableDefinitions !== undefined,
        JSON.stringify(input.variableDefinitions ?? []),
        input.isActive,
        input.sortOrder
      ]
    );

    return result.rows[0] ?? null;
  }

  async delete(
    client: PoolClient,
    input: {
      organizationId: string;
      templateId: string;
    }
  ) {
    const result = await client.query(
      `
        delete from quick_reply_templates
        where organization_id = $1
          and id = $2
      `,
      [input.organizationId, input.templateId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async recordUsage(
    client: PoolClient,
    input: {
      organizationId: string;
      templateId: string;
    }
  ): Promise<QuickReplyTemplateRow | null> {
    const result = await client.query<QuickReplyTemplateRow>(
      `
        update quick_reply_templates
        set usage_count = usage_count + 1,
            last_used_at = now()
        where organization_id = $1
          and id = $2
          and is_active
        returning
          id,
          organization_id,
          title,
          body,
          category,
          variable_definitions,
          is_active,
          sort_order,
          usage_count,
          last_used_at,
          created_by,
          created_at,
          updated_at
      `,
      [input.organizationId, input.templateId]
    );

    return result.rows[0] ?? null;
  }

  async getAnalytics(
    client: PoolClient,
    input: {
      organizationId: string;
    }
  ): Promise<{
    summary: QuickReplyAnalyticsSummaryRow;
    templates: QuickReplyAnalyticsTemplateRow[];
  }> {
    const summaryResult = await client.query<QuickReplyAnalyticsSummaryRow>(
      `
        select
          count(*)::int as total_templates,
          coalesce(sum(qrme_counts.send_count), 0)::int as total_sends,
          coalesce(sum(qrme_counts.customer_replied_count), 0)::int as customer_replied_count,
          coalesce(sum(qrme_counts.lead_created_count), 0)::int as lead_created_count,
          coalesce(sum(qrme_counts.order_created_count), 0)::int as order_created_count,
          coalesce(sum(qrme_counts.order_closed_won_count), 0)::int as order_closed_won_count,
          coalesce(sum(qrme_counts.order_closed_lost_count), 0)::int as order_closed_lost_count
        from quick_reply_templates qrt
        left join (
          select
            quick_reply_template_id,
            count(*)::int as send_count,
            count(*) filter (where outcome_status in ('customer_replied', 'lead_created', 'order_created', 'order_closed_won', 'order_closed_lost'))::int as customer_replied_count,
            count(*) filter (where outcome_status in ('lead_created', 'order_created', 'order_closed_won', 'order_closed_lost'))::int as lead_created_count,
            count(*) filter (where outcome_status in ('order_created', 'order_closed_won', 'order_closed_lost'))::int as order_created_count,
            count(*) filter (where outcome_status = 'order_closed_won')::int as order_closed_won_count,
            count(*) filter (where outcome_status = 'order_closed_lost')::int as order_closed_lost_count
          from quick_reply_message_events
          where organization_id = $1
          group by quick_reply_template_id
        ) qrme_counts on qrme_counts.quick_reply_template_id = qrt.id
        where qrt.organization_id = $1
      `,
      [input.organizationId]
    );

    const templatesResult = await client.query<QuickReplyAnalyticsTemplateRow>(
      `
        select
          qrt.id as template_id,
          qrt.title,
          qrt.category,
          qrt.usage_count,
          coalesce(qrme_counts.send_count, 0)::int as send_count,
          coalesce(qrme_counts.customer_replied_count, 0)::int as customer_replied_count,
          coalesce(qrme_counts.lead_created_count, 0)::int as lead_created_count,
          coalesce(qrme_counts.order_created_count, 0)::int as order_created_count,
          coalesce(qrme_counts.order_closed_won_count, 0)::int as order_closed_won_count,
          coalesce(qrme_counts.order_closed_lost_count, 0)::int as order_closed_lost_count,
          case
            when coalesce(qrme_counts.send_count, 0) = 0 then 0
            else round((coalesce(qrme_counts.customer_replied_count, 0)::numeric / qrme_counts.send_count::numeric) * 100, 2)
          end as response_rate,
          case
            when coalesce(qrme_counts.send_count, 0) = 0 then 0
            else round((coalesce(qrme_counts.lead_created_count, 0)::numeric / qrme_counts.send_count::numeric) * 100, 2)
          end as lead_rate,
          case
            when coalesce(qrme_counts.send_count, 0) = 0 then 0
            else round((coalesce(qrme_counts.order_closed_won_count, 0)::numeric / qrme_counts.send_count::numeric) * 100, 2)
          end as win_rate,
          qrt.last_used_at
        from quick_reply_templates qrt
        left join (
          select
            quick_reply_template_id,
            count(*)::int as send_count,
            count(*) filter (where outcome_status in ('customer_replied', 'lead_created', 'order_created', 'order_closed_won', 'order_closed_lost'))::int as customer_replied_count,
            count(*) filter (where outcome_status in ('lead_created', 'order_created', 'order_closed_won', 'order_closed_lost'))::int as lead_created_count,
            count(*) filter (where outcome_status in ('order_created', 'order_closed_won', 'order_closed_lost'))::int as order_created_count,
            count(*) filter (where outcome_status = 'order_closed_won')::int as order_closed_won_count,
            count(*) filter (where outcome_status = 'order_closed_lost')::int as order_closed_lost_count
          from quick_reply_message_events
          where organization_id = $1
          group by quick_reply_template_id
        ) qrme_counts on qrme_counts.quick_reply_template_id = qrt.id
        where qrt.organization_id = $1
        order by win_rate desc, response_rate desc, send_count desc, qrt.title asc
      `,
      [input.organizationId]
    );

    return {
      summary: summaryResult.rows[0] ?? {
        total_templates: 0,
        total_sends: 0,
        customer_replied_count: 0,
        lead_created_count: 0,
        order_created_count: 0,
        order_closed_won_count: 0,
        order_closed_lost_count: 0
      },
      templates: templatesResult.rows
    };
  }
}
