import type { PoolClient } from "pg";

export interface QuickReplyTemplateRow {
  id: string;
  organization_id: string;
  title: string;
  body: string;
  category: string | null;
  is_active: boolean;
  sort_order: number;
  usage_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
          is_active,
          sort_order,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning
          id,
          organization_id,
          title,
          body,
          category,
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
            is_active = coalesce($7, is_active),
            sort_order = coalesce($8, sort_order)
        where organization_id = $1
          and id = $2
        returning
          id,
          organization_id,
          title,
          body,
          category,
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
}
