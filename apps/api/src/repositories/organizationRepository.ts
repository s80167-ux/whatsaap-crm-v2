import type { PoolClient } from "pg";

type OrganizationColumns = {
  status: boolean;
  is_active: boolean;
  deleted_at: boolean;
};

export class OrganizationRepository {
  private static cachedColumns: OrganizationColumns | null = null;

  private async getColumns(client: PoolClient): Promise<OrganizationColumns> {
    if (OrganizationRepository.cachedColumns) {
      return OrganizationRepository.cachedColumns;
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
      is_active: names.has("is_active"),
      deleted_at: names.has("deleted_at")
    };

    OrganizationRepository.cachedColumns = columns;
    return columns;
  }

  private buildActivePredicate(columns: OrganizationColumns) {
    if (columns.status) {
      return "status in ('active', 'trial')";
    }

    if (columns.deleted_at && columns.is_active) {
      return "deleted_at is null and coalesce(is_active, true)";
    }

    if (columns.is_active) {
      return "coalesce(is_active, true)";
    }

    if (columns.deleted_at) {
      return "deleted_at is null";
    }

    return "true";
  }

  async exists(client: PoolClient, organizationId: string): Promise<boolean> {
    const columns = await this.getColumns(client);
    const result = await client.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from organizations
          where id = $1
            and ${this.buildActivePredicate(columns)}
        ) as exists
      `,
      [organizationId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async findById(client: PoolClient, organizationId: string): Promise<{ id: string; name: string; slug: string } | null> {
    const columns = await this.getColumns(client);
    const result = await client.query<{ id: string; name: string; slug: string }>(
      `
        select id, name, slug
        from organizations
        where id = $1
          and ${this.buildActivePredicate(columns)}
        limit 1
      `,
      [organizationId]
    );

    return result.rows[0] ?? null;
  }
}
