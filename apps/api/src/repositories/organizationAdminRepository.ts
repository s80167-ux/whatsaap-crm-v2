import type { PoolClient } from "pg";

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
}

type OrganizationColumns = {
  status: boolean;
  timezone: boolean;
  is_active: boolean;
  deleted_at: boolean;
  updated_at: boolean;
};

export class OrganizationAdminRepository {
  private static cachedColumns: OrganizationColumns | null = null;

  private async getColumns(client: PoolClient): Promise<OrganizationColumns> {
    if (OrganizationAdminRepository.cachedColumns) {
      return OrganizationAdminRepository.cachedColumns;
    }

    const result = await client.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'organizations'
      `
    );

    const names = new Set(result.rows.map((row) => row.column_name));
    const columns: OrganizationColumns = {
      status: names.has("status"),
      timezone: names.has("timezone"),
      is_active: names.has("is_active"),
      deleted_at: names.has("deleted_at"),
      updated_at: names.has("updated_at")
    };

    OrganizationAdminRepository.cachedColumns = columns;
    return columns;
  }

  private buildSelect(columns: OrganizationColumns) {
    const statusExpression = columns.status
      ? "status"
      : columns.deleted_at && columns.is_active
        ? "case when deleted_at is not null then 'closed' when coalesce(is_active, true) then 'active' else 'suspended' end"
        : columns.is_active
          ? "case when coalesce(is_active, true) then 'active' else 'suspended' end"
          : "'active'";

    return `
      select
        id,
        name,
        slug,
        ${statusExpression} as status,
        created_at
      from organizations
    `;
  }

  async list(client: PoolClient): Promise<OrganizationRecord[]> {
    const columns = await this.getColumns(client);
    const result = await client.query<OrganizationRecord>(
      `
        ${this.buildSelect(columns)}
        order by created_at desc
      `
    );

    return result.rows;
  }

  async create(
    client: PoolClient,
    input: { name: string; slug: string }
  ): Promise<OrganizationRecord> {
    const columns = await this.getColumns(client);
    const insertColumns = ["name", "slug"];
    const insertValues = ["$1", "$2"];
    const params: string[] = [input.name, input.slug];

    if (columns.status) {
      insertColumns.push("status");
      insertValues.push(`$${insertValues.length + 1}`);
      params.push("active");
    }

    if (columns.timezone) {
      insertColumns.push("timezone");
      insertValues.push(`$${insertValues.length + 1}`);
      params.push("Asia/Kuala_Lumpur");
    }

    if (columns.is_active) {
      insertColumns.push("is_active");
      insertValues.push(`$${insertValues.length + 1}`);
      params.push("true");
    }

    const result = await client.query<OrganizationRecord>(
      `
        insert into organizations (${insertColumns.join(", ")})
        values (${insertValues.join(", ")})
        returning
          id,
          name,
          slug,
          ${columns.status
            ? "status"
            : columns.deleted_at && columns.is_active
              ? "case when deleted_at is not null then 'closed' when coalesce(is_active, true) then 'active' else 'suspended' end"
              : columns.is_active
                ? "case when coalesce(is_active, true) then 'active' else 'suspended' end"
                : "'active'"} as status,
          created_at
      `,
      params
    );

    return result.rows[0];
  }

  async findById(client: PoolClient, organizationId: string): Promise<OrganizationRecord | null> {
    const columns = await this.getColumns(client);
    const result = await client.query<OrganizationRecord>(
      `
        ${this.buildSelect(columns)}
        where id = $1
        limit 1
      `,
      [organizationId]
    );

    return result.rows[0] ?? null;
  }

  async softDelete(client: PoolClient, organizationId: string): Promise<OrganizationRecord | null> {
    const columns = await this.getColumns(client);
    const assignments = [];

    if (columns.status) {
      assignments.push(`status = 'closed'`);
    }

    if (columns.is_active) {
      assignments.push(`is_active = false`);
    }

    if (columns.deleted_at) {
      assignments.push(`deleted_at = timezone('utc', now())`);
    }

    if (columns.updated_at) {
      assignments.push(`updated_at = timezone('utc', now())`);
    }

    if (assignments.length === 0) {
      return this.findById(client, organizationId);
    }

    const result = await client.query<OrganizationRecord>(
      `
        update organizations
        set ${assignments.join(",\n            ")}
        where id = $1
        returning
          id,
          name,
          slug,
          ${columns.status
            ? "status"
            : columns.deleted_at && columns.is_active
              ? "case when deleted_at is not null then 'closed' when coalesce(is_active, true) then 'active' else 'suspended' end"
              : columns.is_active
                ? "case when coalesce(is_active, true) then 'active' else 'suspended' end"
                : "'active'"} as status,
          created_at
      `,
      [organizationId]
    );

    return result.rows[0] ?? null;
  }
}
