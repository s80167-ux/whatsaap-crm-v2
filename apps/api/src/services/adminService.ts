import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import type { PoolClient } from "pg";
import { OrganizationAdminRepository } from "../repositories/organizationAdminRepository.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";
import { UserAdminRepository } from "../repositories/userAdminRepository.js";
import { WhatsAppAdminRepository } from "../repositories/whatsAppAdminRepository.js";
import { AuthService } from "./authService.js";
import type { AuthUser, UserRole } from "../types/auth.js";
import { RawEventProcessorService } from "./rawEventProcessorService.js";
import { ConnectorClient } from "./connectorClient.js";

const CAMPAIGNS_MODULE_KEY = "campaigns";
const MAX_WHATSAPP_ACCOUNTS_KEY = "max_whatsapp_accounts";
const HISTORY_SYNC_DAYS_KEY = "history_sync_days";
const MAX_USERS_KEY = "max_users";
const DEFAULT_MAX_WHATSAPP_ACCOUNTS = 1;
const DEFAULT_HISTORY_SYNC_DAYS = 7;

type OrganizationLimitKey =
  | typeof MAX_WHATSAPP_ACCOUNTS_KEY
  | typeof HISTORY_SYNC_DAYS_KEY
  | typeof MAX_USERS_KEY;

type OrganizationAccessLimitsUpdateInput = {
  campaignsEnabled?: boolean;
  maxWhatsappAccounts?: number;
  historySyncDays?: number;
  maxUsers?: number | null;
};

function slugifyOrganizationName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canManageOrganizationWhatsAppAccounts(authUser: AuthUser) {
  return authUser.role === "super_admin" || authUser.role === "org_admin";
}

function canManageWhatsAppAccount(authUser: AuthUser, account: { organization_id: string; created_by?: string | null }) {
  if (authUser.role === "super_admin") {
    return true;
  }

  if (account.organization_id !== authUser.organizationId) {
    return false;
  }

  if (authUser.role === "org_admin") {
    return true;
  }

  return Boolean(authUser.organizationUserId && account.created_by === authUser.organizationUserId);
}

export class AdminService {
  constructor(
    private readonly organizationRepository = new OrganizationAdminRepository(),
    private readonly userRepository = new UserAdminRepository(),
    private readonly whatsappRepository = new WhatsAppAdminRepository(),
    private readonly rawEventRepository = new RawEventRepository(),
    private readonly authService = new AuthService(),
    private readonly rawEventProcessorService = new RawEventProcessorService(),
    private readonly connectorClient = new ConnectorClient()
  ) {}

  async listOrganizations() {
    const client = await pool.connect();
    try {
      return await this.organizationRepository.list(client);
    } finally {
      client.release();
    }
  }

  async createOrganization(input: { name: string; slug?: string | null }) {
    return withTransaction(async (client) => {
      const slug = input.slug?.trim() || slugifyOrganizationName(input.name);
      return this.organizationRepository.create(client, {
        name: input.name.trim(),
        slug
      });
    });
  }

  async updateOrganization(input: {
    organizationId: string;
    name: string;
    slug?: string | null;
    status?: "active" | "trial" | "suspended" | "closed";
  }) {
    return withTransaction(async (client) => {
      const organization = await this.organizationRepository.update(client, input.organizationId, {
        name: input.name.trim(),
        slug: input.slug?.trim() || slugifyOrganizationName(input.name),
        status: input.status
      });

      if (!organization) {
        throw new AppError("Organization not found", 404, "organization_not_found");
      }

      return organization;
    });
  }

  async deleteOrganization(organizationId: string) {
    return withTransaction(async (client) => {
      const organization = await this.organizationRepository.softDelete(client, organizationId);

      if (!organization) {
        throw new Error("Organization not found");
      }

      return organization;
    });
  }

  async getCampaignsModuleStatus(authUser: AuthUser, organizationId?: string | null) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId) {
      return {
        organizationId: null,
        moduleKey: CAMPAIGNS_MODULE_KEY,
        isEnabled: false
      };
    }

    const client = await pool.connect();
    try {
      const result = await client.query<{ is_enabled: boolean }>(
        `
          select is_enabled
          from organization_modules
          where organization_id = $1
            and module_key = $2
          limit 1
        `,
        [resolvedOrganizationId, CAMPAIGNS_MODULE_KEY]
      );

      return {
        organizationId: resolvedOrganizationId,
        moduleKey: CAMPAIGNS_MODULE_KEY,
        isEnabled: result.rows[0]?.is_enabled ?? false
      };
    } finally {
      client.release();
    }
  }

  async listOrganizationModules(organizationId: string) {
    const client = await pool.connect();
    try {
      const result = await client.query<{
        id: string;
        organization_id: string;
        module_key: string;
        is_enabled: boolean;
        enabled_by: string | null;
        enabled_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          select
            id,
            organization_id,
            module_key,
            is_enabled,
            enabled_by,
            enabled_at,
            created_at,
            updated_at
          from organization_modules
          where organization_id = $1
          order by module_key asc
        `,
        [organizationId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  async updateCampaignsModule(authUser: AuthUser, organizationId: string, isEnabled: boolean) {
    return withTransaction((client) => this.updateCampaignsModuleWithClient(client, authUser, organizationId, isEnabled));
  }

  private async updateCampaignsModuleWithClient(
    client: PoolClient,
    authUser: AuthUser,
    organizationId: string,
    isEnabled: boolean
  ) {
    const result = await client.query<{
        id: string;
        organization_id: string;
        module_key: string;
        is_enabled: boolean;
        enabled_by: string | null;
        enabled_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          insert into organization_modules (
            organization_id,
            module_key,
            is_enabled,
            enabled_by,
            enabled_at,
            updated_at
          )
          values (
            $1,
            $2,
            $3,
            $4,
            case when $3 then timezone('utc', now()) else null end,
            timezone('utc', now())
          )
          on conflict (organization_id, module_key)
          do update set
            is_enabled = excluded.is_enabled,
            enabled_by = excluded.enabled_by,
            enabled_at = excluded.enabled_at,
            updated_at = timezone('utc', now())
          returning
            id,
            organization_id,
            module_key,
            is_enabled,
            enabled_by,
            enabled_at,
            created_at,
            updated_at
        `,
        [organizationId, CAMPAIGNS_MODULE_KEY, isEnabled, authUser.authUserId ?? null]
      );

    return result.rows[0];
  }

  private async getOrganizationLimitValueWithClient(
    client: PoolClient,
    organizationId: string,
    limitKey: OrganizationLimitKey,
    defaultValue: number | null
  ) {
    const result = await client.query<{ limit_value: number }>(
      `
        select limit_value
        from organization_limits
        where organization_id = $1
          and limit_key = $2
        limit 1
      `,
      [organizationId, limitKey]
    );

    return result.rows[0]?.limit_value ?? defaultValue;
  }

  async getOrganizationLimitValue(organizationId: string, limitKey: OrganizationLimitKey, defaultValue: number | null) {
    const client = await pool.connect();
    try {
      return this.getOrganizationLimitValueWithClient(client, organizationId, limitKey, defaultValue);
    } finally {
      client.release();
    }
  }

  private async updateOrganizationLimitWithClient(
    client: PoolClient,
    organizationId: string,
    limitKey: OrganizationLimitKey,
    value: number | null
  ) {
    if (value === null) {
      await client.query(
        `
          delete from organization_limits
          where organization_id = $1
            and limit_key = $2
        `,
        [organizationId, limitKey]
      );
      return null;
    }

    const result = await client.query<{
      id: string;
      organization_id: string;
      limit_key: string;
      limit_value: number;
      created_at: string;
      updated_at: string;
    }>(
      `
        insert into organization_limits (
          organization_id,
          limit_key,
          limit_value,
          updated_at
        )
        values ($1, $2, $3, timezone('utc', now()))
        on conflict (organization_id, limit_key)
        do update set
          limit_value = excluded.limit_value,
          updated_at = timezone('utc', now())
        returning
          id,
          organization_id,
          limit_key,
          limit_value,
          created_at,
          updated_at
      `,
      [organizationId, limitKey, value]
    );

    return result.rows[0];
  }

  async updateOrganizationLimit(organizationId: string, limitKey: OrganizationLimitKey, value: number | null) {
    return withTransaction((client) =>
      this.updateOrganizationLimitWithClient(client, organizationId, limitKey, value)
    );
  }

  async getOrganizationAccessLimits(authUser: AuthUser, organizationId: string) {
    if (authUser.role !== "super_admin") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    const client = await pool.connect();
    try {
      const campaignsStatus = await this.getCampaignsModuleStatus(authUser, organizationId);
      const maxWhatsappAccounts = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        MAX_WHATSAPP_ACCOUNTS_KEY,
        DEFAULT_MAX_WHATSAPP_ACCOUNTS
      );
      const historySyncDays = await this.getOrganizationLimitValueWithClient(
        client,
        organizationId,
        HISTORY_SYNC_DAYS_KEY,
        DEFAULT_HISTORY_SYNC_DAYS
      );
      const maxUsers = await this.getOrganizationLimitValueWithClient(client, organizationId, MAX_USERS_KEY, null);
      const whatsappAccounts = await this.whatsappRepository.countByOrganization(client, organizationId);

      return {
        organizationId,
        modules: [
          {
            moduleKey: CAMPAIGNS_MODULE_KEY,
            isEnabled: campaignsStatus.isEnabled
          }
        ],
        limits: {
          maxWhatsappAccounts: maxWhatsappAccounts ?? DEFAULT_MAX_WHATSAPP_ACCOUNTS,
          historySyncDays: historySyncDays ?? DEFAULT_HISTORY_SYNC_DAYS,
          maxUsers
        },
        usage: {
          whatsappAccounts
        },
        coreFeatures: {
          whatsappCrm: {
            availableByDefault: true
          }
        }
      };
    } finally {
      client.release();
    }
  }

  async updateOrganizationAccessLimits(
    authUser: AuthUser,
    organizationId: string,
    input: OrganizationAccessLimitsUpdateInput
  ) {
    if (authUser.role !== "super_admin") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    await withTransaction(async (client) => {
      if (input.campaignsEnabled !== undefined) {
        await this.updateCampaignsModuleWithClient(client, authUser, organizationId, input.campaignsEnabled);
      }

      if (input.maxWhatsappAccounts !== undefined) {
        await this.updateOrganizationLimitWithClient(
          client,
          organizationId,
          MAX_WHATSAPP_ACCOUNTS_KEY,
          input.maxWhatsappAccounts
        );
      }

      if (input.historySyncDays !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, HISTORY_SYNC_DAYS_KEY, input.historySyncDays);
      }

      if (input.maxUsers !== undefined) {
        await this.updateOrganizationLimitWithClient(client, organizationId, MAX_USERS_KEY, input.maxUsers);
      }
    });

    return this.getOrganizationAccessLimits(authUser, organizationId);
  }

  async listUsers(authUser: AuthUser, organizationId?: string) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? organizationId : authUser.organizationId;

    const client = await pool.connect();
    try {
      if (authUser.role === "super_admin" && !resolvedOrganizationId) {
        return await this.userRepository.listAll(client);
      }

      if (!resolvedOrganizationId) {
        throw new Error("organization_id is required");
      }

      return await this.userRepository.listByOrganization(client, resolvedOrganizationId);
    } finally {
      client.release();
    }
  }

  async createUser(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      email: string;
      fullName: string | null;
      avatarUrl?: string | null;
      password: string;
      role: UserRole;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId && input.role !== "super_admin") {
      throw new Error("organization_id is required");
    }

    if (authUser.role !== "super_admin" && input.role === "super_admin") {
      throw new Error("Only super_admin can create another super_admin");
    }

    return this.authService.createUser({
      organizationId: input.role === "super_admin" ? null : resolvedOrganizationId,
      email: input.email,
      fullName: input.fullName,
      avatarUrl: input.avatarUrl ?? null,
      password: input.password,
      role: input.role
    });
  }

  async updateUser(
    authUser: AuthUser,
    userId: string,
    input: {
      organizationId?: string | null;
      fullName: string | null;
      avatarUrl?: string | null;
      role: Exclude<UserRole, "super_admin">;
      status: "invited" | "active" | "disabled";
    }
  ) {
    return withTransaction(async (client) => {
      const existingUser = await this.userRepository.findById(client, userId);

      if (!existingUser) {
        throw new AppError("User not found", 404, "user_not_found");
      }

      if (authUser.role !== "super_admin" && existingUser.organization_id !== authUser.organizationId) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      if (existingUser.auth_user_id && existingUser.auth_user_id === authUser.authUserId && input.status !== "active") {
        throw new AppError("You cannot disable your own user", 400, "cannot_disable_self");
      }

      const resolvedOrganizationId = authUser.role === "super_admin"
        ? input.organizationId ?? existingUser.organization_id
        : existingUser.organization_id;

      if (!resolvedOrganizationId) {
        throw new AppError("organization_id is required", 400, "organization_required");
      }

      const updatedUser = await this.userRepository.updateById(client, userId, {
        organizationId: resolvedOrganizationId,
        fullName: input.fullName,
        avatarUrl: input.avatarUrl === undefined ? existingUser.avatar_url : input.avatarUrl,
        role: input.role,
        status: input.status
      });

      if (!updatedUser) {
        throw new AppError("User not found", 404, "user_not_found");
      }

      return updatedUser;
    });
  }

  async resetUserPassword(authUser: AuthUser, userId: string, password: string) {
    const existingUser = await withTransaction(async (client) => {
      const user = await this.userRepository.findById(client, userId);

      if (!user || user.status === "disabled") {
        throw new AppError("User not found", 404, "user_not_found");
      }

      if (!user.auth_user_id) {
        throw new AppError("User does not have an auth account", 400, "auth_user_missing");
      }

      if (user.auth_user_id === authUser.authUserId) {
        throw new AppError("Use the current user password reset action for your own account", 400, "use_self_password_reset");
      }

      if (authUser.role === "super_admin") {
        return user;
      }

      if (authUser.role !== "org_admin" || user.organization_id !== authUser.organizationId || user.role === "org_admin") {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return user;
    });

    const targetAuthUserId = existingUser.auth_user_id;

    if (!targetAuthUserId) {
      throw new AppError("User does not have an auth account", 400, "auth_user_missing");
    }

    await this.authService.updatePassword(targetAuthUserId, password);

    return existingUser;
  }

  async deleteUser(authUser: AuthUser, userId: string) {
    const deletedUser = await withTransaction(async (client) => {
      const existingUser = await this.userRepository.findById(client, userId);

      if (!existingUser || existingUser.status === "disabled") {
        throw new Error("User not found");
      }

      if (authUser.role !== "super_admin" && existingUser.organization_id !== authUser.organizationId) {
        throw new Error("Insufficient permissions");
      }

      if (existingUser.auth_user_id && existingUser.auth_user_id === authUser.authUserId) {
        throw new Error("You cannot delete your own user");
      }

      return this.userRepository.deleteById(client, userId);
    });

    if (!deletedUser) {
      throw new Error("User not found");
    }

    if (deletedUser.auth_user_id) {
      try {
        await this.authService.deleteAuthUser(deletedUser.auth_user_id);
      } catch (error) {
        logger.warn(
          { error, authUserId: deletedUser.auth_user_id, userId: deletedUser.id },
          "Organization user deleted but Supabase auth cleanup failed"
        );
      }
    }

    return deletedUser;
  }

  async listWhatsAppAccounts(authUser: AuthUser, organizationId?: string) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? organizationId : authUser.organizationId;

    const client = await pool.connect();
    try {
      if (authUser.role === "super_admin" && !resolvedOrganizationId) {
        return await this.whatsappRepository.listAll(client);
      }

      if (!resolvedOrganizationId) {
        throw new Error("organization_id is required");
      }

      if (!canManageOrganizationWhatsAppAccounts(authUser)) {
        if (!authUser.organizationUserId) {
          throw new AppError("Organization user context is required", 403, "organization_user_required");
        }

        return await this.whatsappRepository.listByOrganizationAndCreator(
          client,
          resolvedOrganizationId,
          authUser.organizationUserId
        );
      }

      return await this.whatsappRepository.listByOrganization(client, resolvedOrganizationId);
    } finally {
      client.release();
    }
  }

  async createWhatsAppAccount(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      name: string;
      phoneNumber: string | null;
      historySyncLookbackDays?: number | null;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id is required");
    }

    if (!canManageOrganizationWhatsAppAccounts(authUser) && resolvedOrganizationId !== authUser.organizationId) {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }

    if (!canManageOrganizationWhatsAppAccounts(authUser) && !authUser.organizationUserId) {
      throw new AppError("Organization user context is required", 403, "organization_user_required");
    }

    const account = await withTransaction(async (client) => {
      const currentAccounts = await this.whatsappRepository.countByOrganization(client, resolvedOrganizationId);
      const maxWhatsappAccounts = await this.getOrganizationLimitValueWithClient(
        client,
        resolvedOrganizationId,
        MAX_WHATSAPP_ACCOUNTS_KEY,
        DEFAULT_MAX_WHATSAPP_ACCOUNTS
      );

      if (currentAccounts >= (maxWhatsappAccounts ?? DEFAULT_MAX_WHATSAPP_ACCOUNTS)) {
        throw new AppError(
          "This organization has reached its WhatsApp connection limit.",
          403,
          "WHATSAPP_ACCOUNT_LIMIT_REACHED"
        );
      }

      return this.whatsappRepository.create(client, {
        organizationId: resolvedOrganizationId,
        name: input.name.trim(),
        phoneNumber: input.phoneNumber,
        createdBy: authUser.organizationUserId,
        historySyncLookbackDays: input.historySyncLookbackDays ?? 7
      });
    });

    void this.connectorClient.initializeAccount(account.id).catch((error) => {
      logger.error({ error, accountId: account.id }, "Failed to initialize WhatsApp session after account creation");
    });

    return account;
  }

  async updateWhatsAppAccount(
    authUser: AuthUser,
    accountId: string,
    input: {
      organizationId?: string | null;
      name: string;
      phoneNumber: string | null;
      historySyncLookbackDays?: number | null;
    }
  ) {
    return withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      const resolvedOrganizationId = authUser.role === "super_admin"
        ? input.organizationId ?? existingAccount.organization_id
        : authUser.role === "org_admin"
          ? input.organizationId ?? existingAccount.organization_id
          : existingAccount.organization_id;

      if (!resolvedOrganizationId) {
        throw new AppError("organization_id is required", 400, "organization_required");
      }

      if (authUser.role === "org_admin" && resolvedOrganizationId !== authUser.organizationId) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      const updatedAccount = await this.whatsappRepository.update(client, accountId, {
        organizationId: resolvedOrganizationId,
        name: input.name.trim(),
        phoneNumber: input.phoneNumber,
        historySyncLookbackDays: input.historySyncLookbackDays ?? existingAccount.history_sync_lookback_days ?? 7
      });

      if (!updatedAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      return updatedAccount;
    });
  }

  async reconnectWhatsAppAccount(authUser: AuthUser, accountId: string) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return existingAccount;
    });

    try {
      await this.connectorClient.reconnectAccount(account.id);
    } catch (error) {
      logger.warn(
        { error, accountId: account.id },
        "Failed to reconnect WhatsApp account through connector"
      );
      throw new AppError(
        "WhatsApp connector is unavailable or failed to start the reconnect flow",
        502,
        "connector_unavailable"
      );
    }

    return account;
  }

  async resetWhatsAppAccountPairing(authUser: AuthUser, accountId: string) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return existingAccount;
    });

    try {
      await this.connectorClient.terminateAccount(account.id);
      await this.connectorClient.reconnectAccount(account.id);
    } catch (error) {
      logger.warn(
        { error, accountId: account.id },
        "Failed to reset WhatsApp account pairing through connector"
      );
      throw new AppError(
        "WhatsApp connector is unavailable or failed to reset the pairing flow",
        502,
        "connector_unavailable"
      );
    }

    return withTransaction(async (client) => {
      return (await this.whatsappRepository.findById(client, accountId)) ?? account;
    });
  }

  async disconnectWhatsAppAccount(authUser: AuthUser, accountId: string) {
    const existingAccount = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return existingAccount;
    });

    try {
      await this.connectorClient.terminateAccount(existingAccount.id);
    } catch (error) {
      logger.warn(
        { error, accountId: existingAccount.id },
        "Failed to disconnect WhatsApp account through connector"
      );
      throw new AppError(
        "WhatsApp connector is unavailable or failed to terminate the session",
        502,
        "connector_unavailable"
      );
    }

    return withTransaction(async (client) => {
      const account = await this.whatsappRepository.updateConnectionStatus(client, accountId, "disconnected");

      if (!account) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      return account;
    });
  }

  async getWhatsAppAccountQr(authUser: AuthUser, accountId: string) {
    const client = await pool.connect();
    try {
      const account = await this.whatsappRepository.findById(client, accountId);

      if (!account) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, account)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      if (account.connection_status !== "qr_required") {
        return null;
      }

      return this.whatsappRepository.findLatestQrByAccountId(client, accountId);
    } finally {
      client.release();
    }
  }

  async deleteWhatsAppAccount(authUser: AuthUser, accountId: string) {
    const account = await withTransaction(async (client) => {
      const existingAccount = await this.whatsappRepository.findById(client, accountId);

      if (!existingAccount) {
        throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
      }

      if (!canManageWhatsAppAccount(authUser, existingAccount)) {
        throw new AppError("Insufficient permissions", 403, "forbidden");
      }

      return this.whatsappRepository.deleteById(client, accountId);
    });

    if (!account) {
      throw new AppError("WhatsApp account not found", 404, "whatsapp_account_not_found");
    }

    void this.connectorClient.terminateAccount(account.id).catch((error) => {
      logger.warn(
        { error, accountId: account.id },
        "WhatsApp account deleted but connector session cleanup failed"
      );
    });

    return account;
  }

  async listRawEvents(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      whatsappAccountId?: string | null;
      statuses?: Array<"pending" | "processing" | "processed" | "failed" | "ignored">;
      limit?: number;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    const client = await pool.connect();
    try {
      return this.rawEventRepository.list(client, {
        organizationId: resolvedOrganizationId,
        whatsappAccountId: input.whatsappAccountId ?? null,
        statuses: input.statuses,
        limit: input.limit
      });
    } finally {
      client.release();
    }
  }

  async replayRawEvents(
    authUser: AuthUser,
    input: {
      organizationId?: string | null;
      whatsappAccountId?: string | null;
      eventIds?: string[];
      statuses?: Array<"failed" | "ignored" | "pending" | "processing" | "processed">;
      limit?: number;
      processNow?: boolean;
    }
  ) {
    const resolvedOrganizationId = authUser.role === "super_admin" ? input.organizationId ?? null : authUser.organizationId;

    if (!resolvedOrganizationId && !input.eventIds?.length) {
      throw new Error("organization_id is required");
    }

    let replayEventIds: string[] = [];

    const replayed = await withTransaction(async (client) => {
      if (input.eventIds && input.eventIds.length > 0) {
        const ownedEvents = await this.rawEventRepository.list(client, {
          organizationId: resolvedOrganizationId,
          limit: input.eventIds.length * 2
        });

        const allowedIds = new Set(ownedEvents.map((event) => event.id));
        const filteredIds = input.eventIds.filter((eventId) => allowedIds.has(eventId));
        replayEventIds = filteredIds;

        if (filteredIds.length === 0) {
          return 0;
        }

        return this.rawEventRepository.requeueByIds(client, filteredIds);
      }

      const candidates = await this.rawEventRepository.list(client, {
        organizationId: resolvedOrganizationId,
        whatsappAccountId: input.whatsappAccountId ?? null,
        statuses: input.statuses ?? ["failed"],
        limit: input.limit ?? 100
      });

      replayEventIds = candidates.map((event) => event.id);

      if (replayEventIds.length === 0) {
        return 0;
      }

      return this.rawEventRepository.requeueByIds(client, replayEventIds);
    });

    let processed = 0;

    if (input.processNow && replayed > 0) {
      for (const eventId of replayEventIds) {
        const didProcess = await this.rawEventProcessorService.processEventById(eventId);
        processed += didProcess ? 1 : 0;
      }
    }

    return {
      replayed,
      processed
    };
  }
}
