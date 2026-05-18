import { pool, query, withTransaction } from "../../config/database.js";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { AuthUser } from "../../types/auth.js";

export type SocialChannelPlatform = "facebook" | "instagram";

export type SocialChannelAccount = {
  id: string;
  organization_id: string;
  platform: SocialChannelPlatform;
  label: string;
  external_account_id: string | null;
  external_account_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  connection_status: "new" | "setup_pending" | "connected" | "disconnected" | "error" | "token_expired";
  webhook_status: "pending" | "verified" | "active" | "failed";
  token_expires_at: string | null;
  last_sync_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CreateSocialChannelAccountInput = {
  platform: SocialChannelPlatform;
  label: string;
  externalAccountName?: string | null;
  externalAccountId?: string | null;
  username?: string | null;
};

type UpdateSocialChannelAccountInput = {
  label: string;
  externalAccountName?: string | null;
  externalAccountId?: string | null;
  username?: string | null;
};

export class SocialChannelsService {
  private getOrganizationId(auth: AuthUser) {
    if (!auth.organizationId) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    return auth.organizationId;
  }

  async listAccounts(auth: AuthUser) {
    const organizationId = this.getOrganizationId(auth);
    const result = await query<SocialChannelAccount>(
      `
        select
          id,
          organization_id,
          platform,
          label,
          external_account_id,
          external_account_name,
          username,
          profile_picture_url,
          connection_status,
          webhook_status,
          token_expires_at,
          last_sync_at,
          created_by,
          created_at,
          updated_at
        from social_channel_accounts
        where organization_id = $1
        order by created_at desc
      `,
      [organizationId]
    );

    return result.rows;
  }

  async createAccount(auth: AuthUser, input: CreateSocialChannelAccountInput) {
    const organizationId = this.getOrganizationId(auth);

    return withTransaction(async (client) => {
      const result = await client.query<SocialChannelAccount>(
        `
          insert into social_channel_accounts (
            organization_id,
            platform,
            label,
            external_account_id,
            external_account_name,
            username,
            connection_status,
            webhook_status,
            created_by
          )
          values ($1, $2, $3, nullif($4, ''), nullif($5, ''), nullif($6, ''), 'setup_pending', 'pending', $7)
          returning
            id,
            organization_id,
            platform,
            label,
            external_account_id,
            external_account_name,
            username,
            profile_picture_url,
            connection_status,
            webhook_status,
            token_expires_at,
            last_sync_at,
            created_by,
            created_at,
            updated_at
        `,
        [
          organizationId,
          input.platform,
          input.label,
          input.externalAccountId ?? null,
          input.externalAccountName ?? null,
          input.username ?? null,
          auth.organizationUserId
        ]
      );

      return result.rows[0];
    });
  }

  async updateAccount(auth: AuthUser, accountId: string, input: UpdateSocialChannelAccountInput) {
    const organizationId = this.getOrganizationId(auth);

    const result = await withTransaction((client) =>
      client.query<SocialChannelAccount>(
        `
          update social_channel_accounts
          set label = $3,
              external_account_id = nullif($4, ''),
              external_account_name = nullif($5, ''),
              username = nullif($6, '')
          where id = $1
            and organization_id = $2
          returning
            id,
            organization_id,
            platform,
            label,
            external_account_id,
            external_account_name,
            username,
            profile_picture_url,
            connection_status,
            webhook_status,
            token_expires_at,
            last_sync_at,
            created_by,
            created_at,
            updated_at
        `,
        [
          accountId,
          organizationId,
          input.label,
          input.externalAccountId ?? null,
          input.externalAccountName ?? null,
          input.username ?? null
        ]
      )
    );

    const account = result.rows[0];

    if (!account) {
      throw new AppError("Social channel account not found", 404, "social_channel_account_not_found");
    }

    return account;
  }

  async getAccountStatus(auth: AuthUser, accountId: string) {
    const account = await this.findAccount(auth, accountId);

    return {
      id: account.id,
      platform: account.platform,
      connection_status: account.connection_status,
      webhook_status: account.webhook_status,
      last_sync_at: account.last_sync_at,
      updated_at: account.updated_at
    };
  }

  async disconnectAccount(auth: AuthUser, accountId: string) {
    const organizationId = this.getOrganizationId(auth);

    const result = await withTransaction((client) =>
      client.query<SocialChannelAccount>(
        `
          update social_channel_accounts
          set connection_status = 'disconnected',
              webhook_status = 'pending'
          where id = $1
            and organization_id = $2
          returning
            id,
            organization_id,
            platform,
            label,
            external_account_id,
            external_account_name,
            username,
            profile_picture_url,
            connection_status,
            webhook_status,
            token_expires_at,
            last_sync_at,
            created_by,
            created_at,
            updated_at
        `,
        [accountId, organizationId]
      )
    );

    const account = result.rows[0];

    if (!account) {
      throw new AppError("Social channel account not found", 404, "social_channel_account_not_found");
    }

    return account;
  }

  async deleteAccount(auth: AuthUser, accountId: string) {
    const organizationId = this.getOrganizationId(auth);

    const result = await withTransaction((client) =>
      client.query<Pick<SocialChannelAccount, "id">>(
        `
          delete from social_channel_accounts
          where id = $1
            and organization_id = $2
          returning id
        `,
        [accountId, organizationId]
      )
    );

    const account = result.rows[0];

    if (!account) {
      throw new AppError("Social channel account not found", 404, "social_channel_account_not_found");
    }

    return account;
  }

  getMetaConnectUrl(auth: AuthUser, platform: SocialChannelPlatform) {
    this.getOrganizationId(auth);

    const missingConfig = [
      env.META_APP_ID ? null : "META_APP_ID",
      env.META_REDIRECT_URI ? null : "META_REDIRECT_URI"
    ].filter((value): value is string => Boolean(value));

    const metaAppId = env.META_APP_ID;
    const metaRedirectUri = env.META_REDIRECT_URI;

    if (missingConfig.length > 0 || !metaAppId || !metaRedirectUri) {
      return {
        configured: false,
        url: null,
        missingConfig,
        message: "Meta OAuth environment is not configured yet."
      };
    }

    const scopes =
      platform === "facebook"
        ? ["pages_show_list", "pages_messaging", "pages_manage_metadata"]
        : ["instagram_basic", "instagram_manage_messages", "pages_show_list", "pages_manage_metadata"];

    const url = new URL(`https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", metaAppId);
    url.searchParams.set("redirect_uri", metaRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set(
      "state",
      Buffer.from(JSON.stringify({ platform, organizationId: auth.organizationId })).toString("base64url")
    );

    return {
      configured: true,
      url: url.toString(),
      missingConfig: [],
      message: "Meta OAuth URL is ready."
    };
  }

  exchangeMetaCode(_auth: AuthUser) {
    return {
      enabled: false,
      message: "Meta OAuth exchange not enabled yet."
    };
  }

  private async findAccount(auth: AuthUser, accountId: string) {
    const organizationId = this.getOrganizationId(auth);
    const client = await pool.connect();

    try {
      const result = await client.query<SocialChannelAccount>(
        `
          select
            id,
            organization_id,
            platform,
            label,
            external_account_id,
            external_account_name,
            username,
            profile_picture_url,
            connection_status,
            webhook_status,
            token_expires_at,
            last_sync_at,
            created_by,
            created_at,
            updated_at
          from social_channel_accounts
          where id = $1
            and organization_id = $2
        `,
        [accountId, organizationId]
      );

      const account = result.rows[0];

      if (!account) {
        throw new AppError("Social channel account not found", 404, "social_channel_account_not_found");
      }

      return account;
    } finally {
      client.release();
    }
  }
}
