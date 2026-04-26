import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import { OrganizationAdminRepository } from "../repositories/organizationAdminRepository.js";
import { RawEventRepository } from "../repositories/rawEventRepository.js";
import { UserAdminRepository } from "../repositories/userAdminRepository.js";
import { WhatsAppAdminRepository } from "../repositories/whatsAppAdminRepository.js";
import { AuthService } from "./authService.js";
import type { AuthUser, UserRole } from "../types/auth.js";
import { RawEventProcessorService } from "./rawEventProcessorService.js";
import { ConnectorClient } from "./connectorClient.js";

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
