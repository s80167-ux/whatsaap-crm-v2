import type { PoolClient } from "pg";
import type { UserRole } from "../types/auth.js";

export interface UserSummaryRecord {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string | null;
  role: Exclude<UserRole, "super_admin">;
  status: "invited" | "active" | "disabled";
  created_at: string;
}

export class UserAdminRepository {
  async listAll(client: PoolClient): Promise<UserSummaryRecord[]> {
    const result = await client.query<UserSummaryRecord>(
      `
        select id, organization_id, auth_user_id, email, full_name, role, status, created_at
        from organization_users
        order by created_at desc
      `
    );

    return result.rows;
  }

  async listByOrganization(client: PoolClient, organizationId: string): Promise<UserSummaryRecord[]> {
    const result = await client.query<UserSummaryRecord>(
      `
        select id, organization_id, auth_user_id, email, full_name, role, status, created_at
        from organization_users
        where organization_id = $1
        order by created_at desc
      `,
      [organizationId]
    );

    return result.rows;
  }
}
