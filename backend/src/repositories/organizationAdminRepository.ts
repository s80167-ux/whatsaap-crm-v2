import type { PoolClient } from "pg";

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
}

export class OrganizationAdminRepository {
  async list(client: PoolClient): Promise<OrganizationRecord[]> {
    const result = await client.query<OrganizationRecord>(
      `
        select id, name, slug, status, created_at
        from organizations
        order by created_at desc
      `
    );

    return result.rows;
  }

  async create(
    client: PoolClient,
    input: { name: string; slug: string }
  ): Promise<OrganizationRecord> {
    const result = await client.query<OrganizationRecord>(
      `
        insert into organizations (name, slug)
        values ($1, $2)
        returning id, name, slug, status, created_at
      `,
      [input.name, input.slug]
    );

    return result.rows[0];
  }
}
