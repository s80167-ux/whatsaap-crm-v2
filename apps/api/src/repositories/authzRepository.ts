import type { PoolClient } from "pg";
import type { UserRole } from "../types/auth.js";

export const EDITABLE_ROLE_PERMISSION_ROLES = ["org_admin", "manager", "agent", "user"] as const;
export const ROLE_PERMISSION_ROLES = ["super_admin", ...EDITABLE_ROLE_PERMISSION_ROLES] as const;
export type EditableRolePermissionRole = (typeof EDITABLE_ROLE_PERMISSION_ROLES)[number];
export type RolePermissionRole = (typeof ROLE_PERMISSION_ROLES)[number];

export const EDITABLE_ROLE_PERMISSION_KEYS = [
  "platform.view_usage",
  "platform.manage_subscriptions",
  "platform.view_health",
  "org.manage_users",
  "org.manage_whatsapp_accounts",
  "org.manage_settings",
  "contacts.read_all",
  "contacts.read_assigned",
  "contacts.write",
  "conversations.read_all",
  "conversations.read_assigned",
  "conversations.assign",
  "messages.send",
  "sales.read_all",
  "sales.read_assigned",
  "sales.write",
  "data_exports.download",
  "dashboard.view_admin",
  "dashboard.view_agent"
] as const;

export const SUPER_ADMIN_ONLY_PERMISSION_KEYS = [
  "platform.manage_organizations",
  "dashboard.view_super_admin"
] as const;

export const KNOWN_ROLE_PERMISSION_KEYS = [
  ...EDITABLE_ROLE_PERMISSION_KEYS,
  ...SUPER_ADMIN_ONLY_PERMISSION_KEYS
] as const;

type RolePermissionRecord = {
  role: RolePermissionRole;
  permission_key: string;
};

export interface OrganizationUserAuthRecord {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: Exclude<UserRole, "super_admin">;
  status: "invited" | "active" | "disabled";
}

export class AuthzRepository {
  async listRolePermissions(client: PoolClient): Promise<RolePermissionRecord[]> {
    const result = await client.query<RolePermissionRecord>(
      `
        select role, permission_key
        from role_permissions
        where role = any($1::text[])
        order by role asc, permission_key asc
      `,
      [ROLE_PERMISSION_ROLES]
    );

    return result.rows;
  }

  async listRolePermissionKeys(client: PoolClient, role: RolePermissionRole): Promise<string[]> {
    const result = await client.query<{ permission_key: string }>(
      `
        select permission_key
        from role_permissions
        where role = $1
        order by permission_key asc
      `,
      [role]
    );

    return result.rows.map((row) => row.permission_key);
  }

  async replaceRolePermissionKeys(
    client: PoolClient,
    role: EditableRolePermissionRole,
    permissionKeys: string[]
  ) {
    await client.query(
      `
        delete from role_permissions
        where role = $1
      `,
      [role]
    );

    if (permissionKeys.length === 0) {
      return;
    }

    await client.query(
      `
        insert into role_permissions (role, permission_key)
        select $1, unnest($2::text[])
      `,
      [role, permissionKeys]
    );
  }

  async findOrganizationUserByAuthUserId(
    client: PoolClient,
    authUserId: string
  ): Promise<OrganizationUserAuthRecord | null> {
    const result = await client.query<OrganizationUserAuthRecord>(
      `
        select id, organization_id, auth_user_id, full_name, avatar_url, email, role, status
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
