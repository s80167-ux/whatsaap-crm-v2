import type { PoolClient } from "pg";

export class OrganizationRepository {
  async exists(client: PoolClient, organizationId: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      "select exists(select 1 from organizations where id = $1 and status <> 'closed') as exists",
      [organizationId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async findById(client: PoolClient, organizationId: string): Promise<{ id: string; name: string; slug: string } | null> {
    const result = await client.query<{ id: string; name: string; slug: string }>(
      `
        select id, name, slug
        from organizations
        where id = $1
          and status <> 'closed'
        limit 1
      `,
      [organizationId]
    );

    return result.rows[0] ?? null;
  }
}
