import type { PoolClient } from "pg";
import type { UserRole } from "../types/auth.js";

export interface OrganizationUserRecord {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: Exclude<UserRole, "super_admin">;
  status: "invited" | "active" | "disabled";
  created_at: string;
}

export class OrganizationUserRepository {
  async findById(client: PoolClient, organizationUserId: string): Promise<OrganizationUserRecord | null> {
    const result = await client.query<OrganizationUserRecord>(
      `
        select id, organization_id, auth_user_id, full_name, avatar_url, email, role, status, created_at
        from organization_users
        where id = $1
        limit 1
      `,
      [organizationUserId]
    );

    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      authUserId: string;
      email: string;
      fullName: string | null;
      avatarUrl?: string | null;
      role: Exclude<UserRole, "super_admin">;
      status?: "invited" | "active" | "disabled";
    }
  ): Promise<OrganizationUserRecord> {
    const result = await client.query<OrganizationUserRecord>(
      `
        insert into organization_users (
          organization_id,
          auth_user_id,
          full_name,
          avatar_url,
          email,
          role,
          status
        )
        values ($1, $2, $3, $4, lower($5), $6, $7)
        returning id, organization_id, auth_user_id, full_name, avatar_url, email, role, status, created_at
      `,
      [
        input.organizationId,
        input.authUserId,
        input.fullName,
        input.avatarUrl ?? null,
        input.email,
        input.role,
        input.status ?? "active"
      ]
    );

    return result.rows[0];
  }
}
