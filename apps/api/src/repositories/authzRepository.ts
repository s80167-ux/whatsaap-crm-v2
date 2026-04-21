import type { PoolClient } from "pg";
import type { UserRole } from "../types/auth.js";

export interface OrganizationUserAuthRecord {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  full_name: string | null;
  email: string | null;
  role: Exclude<UserRole, "super_admin">;
  status: "invited" | "active" | "disabled";
}

export class AuthzRepository {
  async findOrganizationUserByAuthUserId(
    client: PoolClient,
    authUserId: string
  ): Promise<OrganizationUserAuthRecord | null> {
    const result = await client.query<OrganizationUserAuthRecord>(
      `
        select id, organization_id, auth_user_id, full_name, email, role, status
        from organization_users
        where auth_user_id = $1
        limit 1
      `,
      [authUserId]
    );

    return result.rows[0] ?? null;
  }

  async isPlatformSuperAdmin(client: PoolClient, authUserId: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from platform_super_admins
          where auth_user_id = $1
        ) as exists
      `,
      [authUserId]
    );

    return result.rows[0]?.exists ?? false;
  }

  async listPermissionKeys(
    client: PoolClient,
    input: {
      role: UserRole;
      organizationUserId: string | null;
    }
  ): Promise<string[]> {
    const rolePermissionsResult = await client.query<{ permission_key: string }>(
      `
        select permission_key
        from role_permissions
        where role = $1
      `,
      [input.role]
    );

    const overridePermissionsResult =
      input.organizationUserId === null
        ? { rows: [] as Array<{ permission_key: string }> }
        : await client.query<{ permission_key: string }>(
            `
              select permission_key
              from organization_user_permissions
              where organization_user_id = $1
            `,
            [input.organizationUserId]
          );

    return Array.from(
      new Set([
        ...rolePermissionsResult.rows.map((row) => row.permission_key),
        ...overridePermissionsResult.rows.map((row) => row.permission_key)
      ])
    );
  }
}
