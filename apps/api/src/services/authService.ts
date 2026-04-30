import { pool, withTransaction } from "../config/database.js";
import { createSupabaseAdminClient, createSupabasePublicClient } from "../config/supabase.js";
import { AppError } from "../lib/errors.js";
import { AuthzRepository } from "../repositories/authzRepository.js";
import { OrganizationUserRepository } from "../repositories/organizationUserRepository.js";
import type { AuthUser, UserRole } from "../types/auth.js";

export class AuthService {
  constructor(
    private readonly authzRepository = new AuthzRepository(),
    private readonly organizationUserRepository = new OrganizationUserRepository()
  ) {}

  async login(email: string, password: string) {
    const supabasePublic = createSupabasePublicClient();
    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.session || !data.user) {
      throw new AppError("Invalid email or password", 401, "invalid_credentials");
    }

    const resolvedUser = await this.resolveAuthUser({
      authUserId: data.user.id,
      email: data.user.email ?? email,
      fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) ?? null
    });

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: resolvedUser.authUserId,
        organizationUserId: resolvedUser.organizationUserId,
        organizationId: resolvedUser.organizationId,
        email: resolvedUser.email,
        fullName: resolvedUser.fullName,
        avatarUrl: resolvedUser.avatarUrl,
        role: resolvedUser.role,
        permissionKeys: resolvedUser.permissionKeys
      }
    };
  }

  async refreshSession(refreshToken: string) {
    const supabasePublic = createSupabasePublicClient();
    const { data, error } = await supabasePublic.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session || !data.user) {
      throw new AppError("Invalid or expired session", 401, "invalid_session");
    }

    const resolvedUser = await this.resolveAuthUser({
      authUserId: data.user.id,
      email: data.user.email ?? "",
      fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) ?? null
    });

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: resolvedUser
    };
  }

  async getProfile(authUser: AuthUser) {
    return {
      id: authUser.authUserId,
      organizationUserId: authUser.organizationUserId,
      organizationId: authUser.organizationId,
      email: authUser.email,
      fullName: authUser.fullName,
      avatarUrl: authUser.avatarUrl,
      role: authUser.role,
      permissionKeys: authUser.permissionKeys
    };
  }

  async getAuthUserFromAccessToken(token: string) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new AppError("Invalid or expired token", 401, "invalid_token");
    }

    return this.resolveAuthUser({
      authUserId: data.user.id,
      email: data.user.email ?? "",
      fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) ?? null
    });
  }

  async createUser(input: {
    organizationId: string | null;
    email: string;
    fullName: string | null;
    avatarUrl?: string | null;
    password: string;
    role: UserRole;
  }) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        avatar_url: input.avatarUrl ?? null
      }
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Unable to create Supabase Auth user");
    }

    return withTransaction(async (client) => {
      if (input.role === "super_admin") {
        await client.query(
          `
            insert into platform_super_admins (auth_user_id)
            values ($1)
            on conflict (auth_user_id) do nothing
          `,
          [data.user.id]
        );

        return {
          id: data.user.id,
          organization_id: null,
          auth_user_id: data.user.id,
          email: data.user.email ?? input.email,
          full_name: input.fullName,
          avatar_url: input.avatarUrl ?? null,
          role: "super_admin" as const,
          status: "active" as const,
          created_at: new Date().toISOString()
        };
      }

      if (!input.organizationId) {
        throw new Error("organization_id is required");
      }

      return this.organizationUserRepository.create(client, {
        organizationId: input.organizationId,
        authUserId: data.user.id,
        email: data.user.email ?? input.email,
        fullName: input.fullName,
        avatarUrl: input.avatarUrl ?? null,
        role: input.role,
        status: "active"
      });
    });
  }

  async deleteAuthUser(authUserId: string) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);

    if (error) {
      throw new Error(error.message ?? "Unable to delete Supabase Auth user");
    }
  }

  async updatePassword(authUserId: string, password: string) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password
    });

    if (error) {
      throw new Error(error.message ?? "Unable to update password");
    }
  }

  async updateProfile(authUser: AuthUser, input: { fullName: string | null; avatarUrl: string | null }) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.authUserId, {
      user_metadata: {
        full_name: input.fullName,
        avatar_url: input.avatarUrl
      }
    });

    if (error) {
      throw new Error(error.message ?? "Unable to update profile");
    }

    if (authUser.organizationUserId) {
      await pool.query(
        `
          update organization_users
          set full_name = $2,
              avatar_url = $3
          where id = $1
        `,
        [authUser.organizationUserId, input.fullName, input.avatarUrl]
      );
    }

    return this.getProfile({
      ...authUser,
      fullName: input.fullName,
      avatarUrl: input.avatarUrl
    });
  }

  async logout(accessToken: string) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "local");

    if (error) {
      throw new AppError(error.message ?? "Unable to sign out", 500, "logout_failed");
    }
  }

  private async resolveAuthUser(input: {
    authUserId: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  }): Promise<AuthUser> {
    const client = await pool.connect();
    try {
      const isSuperAdmin = await this.authzRepository.isPlatformSuperAdmin(client, input.authUserId);

      if (isSuperAdmin) {
        const permissionKeys = await this.authzRepository.listPermissionKeys(client, {
          role: "super_admin",
          organizationUserId: null
        });

        return {
          authUserId: input.authUserId,
          organizationUserId: null,
          organizationId: null,
          role: "super_admin",
          email: input.email,
          fullName: input.fullName,
          avatarUrl: input.avatarUrl,
          permissionKeys
        };
      }

      const organizationUser = await this.authzRepository.findOrganizationUserByAuthUserId(client, input.authUserId);

      if (!organizationUser || organizationUser.status !== "active") {
        throw new Error("Authenticated user is not linked to an active organization user");
      }

      const permissionKeys = await this.authzRepository.listPermissionKeys(client, {
        role: organizationUser.role,
        organizationUserId: organizationUser.id
      });

      return {
        authUserId: input.authUserId,
        organizationUserId: organizationUser.id,
        organizationId: organizationUser.organization_id,
        role: organizationUser.role,
        email: organizationUser.email ?? input.email,
        fullName: organizationUser.full_name ?? input.fullName,
        avatarUrl: organizationUser.avatar_url,
        permissionKeys
      };
    } finally {
      client.release();
    }
  }
}
