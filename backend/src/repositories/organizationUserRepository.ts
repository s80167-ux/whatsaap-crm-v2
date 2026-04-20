import type { PoolClient } from "pg";
import type { UserRole } from "../types/auth.js";

export interface OrganizationUserRecord {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  full_name: string | null;
  email: string | null;
  role: Exclude<UserRole, "super_admin">;
  status: "invited" | "active" | "disabled";
  created_at: string;
}

export class OrganizationUserRepository {
  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      authUserId: string;
      email: string;
      fullName: string | null;
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
          email,
          role,
          status
        )
        values ($1, $2, $3, lower($4), $5, $6)
        returning id, organization_id, auth_user_id, full_name, email, role, status, created_at
      `,
      [input.organizationId, input.authUserId, input.fullName, input.email, input.role, input.status ?? "active"]
    );

    return result.rows[0];
  }
}
