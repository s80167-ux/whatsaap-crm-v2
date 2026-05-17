import type { PoolClient } from "pg";
import type { UserRole } from "../types/auth.js";

export interface UserSummaryRecord {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: Exclude<UserRole, "super_admin">;
  status: "invited" | "active" | "disabled";
  created_at: string;
}

type EditableUserRole = Exclude<UserRole, "super_admin">;

export class UserAdminRepository {
  async listAll(client: PoolClient): Promise<UserSummaryRecord[]> {
    const result = await client.query<UserSummaryRecord>(
      `
        select id, organization_id, auth_user_id, email, full_name, avatar_url, coalesce(role, 'user') as role, coalesce(status, 'active') as status, created_at
        from organization_users
        where coalesce(status, 'active') <> 'disabled'
        order by created_at desc
      `
    );

    return result.rows;
  }

  async listByOrganization(client: PoolClient, organizationId: string): Promise<UserSummaryRecord[]> {
    const result = await client.query<UserSummaryRecord>(
      `
        select id, organization_id, auth_user_id, email, full_name, avatar_url, coalesce(role, 'user') as role, coalesce(status, 'active') as status, created_at
        from organization_users
        where organization_id = $1
          and coalesce(status, 'active') <> 'disabled'
        order by created_at desc
      `,
      [organizationId]
    );

    return result.rows;
  }

  async findById(client: PoolClient, userId: string): Promise<UserSummaryRecord | null> {
    const result = await client.query<UserSummaryRecord>(
      `
        select id, organization_id, auth_user_id, email, full_name, avatar_url, role, status, created_at
        from organization_users
        where id = $1
        limit 1
      `,
      [userId]
    );

    return result.rows[0] ?? null;
  }

  async findByOrganizationAndEmail(
    client: PoolClient,
    organizationId: string,
    email: string
  ): Promise<UserSummaryRecord | null> {
    const result = await client.query<UserSummaryRecord>(
      `
        select id, organization_id, auth_user_id, email, full_name, avatar_url, role, status, created_at
        from organization_users
        where organization_id = $1
          and lower(email) = lower($2)
        limit 1
      `,
      [organizationId, email]
    );

    return result.rows[0] ?? null;
  }

  async createFromGoogleSignup(
    client: PoolClient,
    input: {
      organizationId: string;
      authUserId: string;
      email: string;
      fullName: string | null;
      avatarUrl: string | null;
      role: EditableUserRole;
    }
  ): Promise<UserSummaryRecord> {
    const result = await client.query<UserSummaryRecord>(
      `
        insert into organization_users (
          organization_id,
          auth_user_id,
          email,
          full_name,
          avatar_url,
          role,
          status
        )
        values ($1, $2, lower($3), $4, $5, $6, 'active')
        returning id, organization_id, auth_user_id, email, full_name, avatar_url, role, status, created_at
      `,
      [input.organizationId, input.authUserId, input.email, input.fullName, input.avatarUrl, input.role]
    );

    return result.rows[0];
  }

  async linkGoogleSignup(
    client: PoolClient,
    userId: string,
    input: {
      authUserId: string;
      fullName: string | null;
      avatarUrl: string | null;
      role: EditableUserRole;
    }
  ): Promise<UserSummaryRecord | null> {
    const result = await client.query<UserSummaryRecord>(
      `
        update organization_users
        set auth_user_id = $2,
            full_name = coalesce($3, full_name),
            avatar_url = coalesce($4, avatar_url),
            role = $5,
            status = 'active'
        where id = $1
        returning id, organization_id, auth_user_id, email, full_name, avatar_url, role, status, created_at
      `,
      [userId, input.authUserId, input.fullName, input.avatarUrl, input.role]
    );

    return result.rows[0] ?? null;
  }

  async updateById(
    client: PoolClient,
    userId: string,
    input: {
      organizationId: string;
      fullName: string | null;
      avatarUrl: string | null;
      role: EditableUserRole;
      status: UserSummaryRecord["status"];
    }
  ): Promise<UserSummaryRecord | null> {
    const result = await client.query<UserSummaryRecord>(
      `
        update organization_users
        set organization_id = $2,
            full_name = $3,
            avatar_url = $4,
            role = $5,
            status = $6
        where id = $1
        returning id, organization_id, auth_user_id, email, full_name, avatar_url, role, status, created_at
      `,
      [userId, input.organizationId, input.fullName, input.avatarUrl, input.role, input.status]
    );

    return result.rows[0] ?? null;
  }

  async deleteById(client: PoolClient, userId: string): Promise<UserSummaryRecord | null> {
    await client.query(
      `
        delete from organization_user_permissions
        where organization_user_id = $1
      `,
      [userId]
    );

    const result = await client.query<UserSummaryRecord>(
      `
        delete from organization_users
        where id = $1
        returning id, organization_id, auth_user_id, email, full_name, avatar_url, role, status, created_at
      `,
      [userId]
    );

    return result.rows[0] ?? null;
  }
}
