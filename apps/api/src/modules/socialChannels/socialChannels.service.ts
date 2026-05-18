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
  organizationId?: string | null;
};

type UpdateSocialChannelAccountInput = {
  label: string;
  externalAccountName?: string | null;
  externalAccountId?: string | null;
  username?: string | null;
  organizationId?: string | null;
};

type MetaExchangeCodeInput = {
  code?: string;
  state?: string;
};

type ConnectMetaPageInput = {
  platform: SocialChannelPlatform;
  pageId: string;
  state?: string | null;
};

type MetaPageOption = {
  id: string;
  name: string;
  pictureUrl?: string | null;
};

type MetaPageWithToken = MetaPageOption & {
  accessToken: string;
};

type MetaExchangeCodeResponse = {
  enabled?: boolean;
  success?: boolean;
  message: string;
  account?: SocialChannelAccount | null;
  requiresPageSelection?: boolean;
  pages?: MetaPageOption[];
};

type CachedMetaPages = {
  organizationId: string;
  platform: SocialChannelPlatform;
  pages: MetaPageWithToken[];
  expiresAt: number;
};

const FACEBOOK_NOT_READY_MESSAGE = "Facebook connection is not ready yet. Please contact your CRM administrator.";
const META_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const metaPageSelectionCache = new Map<string, CachedMetaPages>();

export class SocialChannelsService {
  private getOrganizationId(auth: AuthUser, requestedOrganizationId?: string | null) {
    if (auth.role === "super_admin") {
      const organizationId = requestedOrganizationId ?? null;

      if (!organizationId) {
        throw new AppError("organization_id is required", 400, "organization_required");
      }

      return organizationId;
    }

    if (!auth.organizationId) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    if (requestedOrganizationId && requestedOrganizationId !== auth.organizationId) {
      throw new AppError("Cannot access another organization", 403, "organization_forbidden");
    }

    return auth.organizationId;
  }

  async listAccounts(auth: AuthUser, requestedOrganizationId?: string | null) {
    const organizationId = this.getOrganizationId(auth, requestedOrganizationId);
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
    const organizationId = this.getOrganizationId(auth, input.organizationId);

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
    const organizationId = this.getOrganizationId(auth, input.organizationId);

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

  async getAccountStatus(auth: AuthUser, accountId: string, requestedOrganizationId?: string | null) {
    const account = await this.findAccount(auth, accountId, requestedOrganizationId);

    return {
      id: account.id,
      platform: account.platform,
      connection_status: account.connection_status,
      webhook_status: account.webhook_status,
      last_sync_at: account.last_sync_at,
      updated_at: account.updated_at
    };
  }

  async disconnectAccount(auth: AuthUser, accountId: string, requestedOrganizationId?: string | null) {
    const organizationId = this.getOrganizationId(auth, requestedOrganizationId);

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

  async deleteAccount(auth: AuthUser, accountId: string, requestedOrganizationId?: string | null) {
    const organizationId = this.getOrganizationId(auth, requestedOrganizationId);

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

  getMetaConnectUrl(auth: AuthUser, platform: SocialChannelPlatform, requestedOrganizationId?: string | null) {
    const organizationId = this.getOrganizationId(auth, requestedOrganizationId);

    const missingConfig = [
      env.META_APP_ID ? null : "META_APP_ID",
      env.META_APP_SECRET ? null : "META_APP_SECRET",
      env.META_REDIRECT_URI ? null : "META_REDIRECT_URI"
    ].filter((value): value is string => Boolean(value));

    const metaAppId = env.META_APP_ID;
    const metaRedirectUri = env.META_REDIRECT_URI;

    if (missingConfig.length > 0 || !metaAppId || !metaRedirectUri) {
      return {
        configured: false,
        url: null,
        missingConfig,
        message: FACEBOOK_NOT_READY_MESSAGE
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
      Buffer.from(JSON.stringify({ platform, organizationId })).toString("base64url")
    );

    return {
      configured: true,
      url: url.toString(),
      missingConfig: [],
      message: "Facebook connection is ready."
    };
  }

  async exchangeMetaCode(auth: AuthUser, input: MetaExchangeCodeInput): Promise<MetaExchangeCodeResponse> {
    const stateContext = this.getStateContext(input.state);
    const organizationId = this.getOrganizationId(auth, stateContext.organizationId);

    if (!input.code) {
      return {
        enabled: true,
        success: false,
        message: "Facebook did not return the required authorization code. Please try again."
      };
    }

    if (!this.hasMetaOAuthConfig()) {
      return {
        enabled: false,
        success: false,
        message: FACEBOOK_NOT_READY_MESSAGE
      };
    }

    const statePlatform = stateContext.platform ?? "facebook";

    try {
      const userAccessToken = await this.exchangeCodeForUserAccessToken(input.code);
      const pages = await this.fetchFacebookPages(userAccessToken);

      if (pages.length === 0) {
        return {
          enabled: true,
          success: false,
          message: "No Facebook Pages were found. Please login with an account that manages a Facebook Page."
        };
      }

      if (pages.length === 1) {
        const account = await this.connectFacebookPage(auth, organizationId, statePlatform, pages[0]);

        return {
          enabled: true,
          success: true,
          message: account.webhook_status === "failed"
            ? "Facebook Page connected, but Messenger inbox sync is not active yet. Please retry or contact admin."
            : "Facebook Messenger connected successfully.",
          account
        };
      }

      this.storePageSelection(organizationId, statePlatform, input.state, pages);

      return {
        enabled: true,
        success: false,
        requiresPageSelection: true,
        message: "Choose a Facebook Page to connect.",
        pages: pages.map(({ accessToken: _accessToken, ...page }) => page)
      };
    } catch (error) {
      return {
        enabled: true,
        success: false,
        message: error instanceof Error ? this.toFriendlyMetaError(error.message) : "Please login with a Facebook account that is admin of the Page."
      };
    }
  }

  async connectMetaPage(auth: AuthUser, input: ConnectMetaPageInput): Promise<MetaExchangeCodeResponse> {
    const stateContext = this.getStateContext(input.state ?? undefined);
    const organizationId = this.getOrganizationId(auth, stateContext.organizationId);
    const cached = this.getCachedPageSelection(organizationId, input.state);

    if (!cached) {
      return {
        enabled: false,
        success: false,
        message: "Page selection is prepared but token persistence is not enabled yet."
      };
    }

    if (cached.platform !== input.platform) {
      return {
        enabled: true,
        success: false,
        message: "Please retry Facebook login for the selected channel."
      };
    }

    const page = cached.pages.find((item) => item.id === input.pageId);

    if (!page) {
      return {
        enabled: true,
        success: false,
        message: "No Facebook Pages were found for this account."
      };
    }

    const account = await this.connectFacebookPage(auth, organizationId, input.platform, page);
    this.clearPageSelection(organizationId, input.state);

    return {
      enabled: true,
      success: true,
      message: account.webhook_status === "failed"
        ? "Facebook Page connected, but Messenger inbox sync is not active yet. Please retry or contact admin."
        : "Facebook Messenger connected successfully.",
      account
    };
  }

  private hasMetaOAuthConfig() {
    return Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_REDIRECT_URI && env.META_GRAPH_API_VERSION);
  }

  private async exchangeCodeForUserAccessToken(code: string) {
    const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token`);
    url.searchParams.set("client_id", env.META_APP_ID ?? "");
    url.searchParams.set("client_secret", env.META_APP_SECRET ?? "");
    url.searchParams.set("redirect_uri", env.META_REDIRECT_URI ?? "");
    url.searchParams.set("code", code);

    const response = await fetch(url);
    const body = await response.json() as { access_token?: string; error?: { message?: string } };

    if (!response.ok || !body.access_token) {
      throw new Error(body.error?.message ?? "Unable to verify Facebook permission.");
    }

    return body.access_token;
  }

  private async fetchFacebookPages(userAccessToken: string): Promise<MetaPageWithToken[]> {
    const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/me/accounts`);
    url.searchParams.set("fields", "id,name,access_token,picture{url}");
    url.searchParams.set("access_token", userAccessToken);

    const response = await fetch(url);
    const body = await response.json() as {
      data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
        picture?: { data?: { url?: string } };
      }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(body.error?.message ?? "Unable to get Facebook Page information.");
    }

    return (body.data ?? [])
      .filter((page): page is { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } } =>
        Boolean(page.id && page.name && page.access_token)
      )
      .map((page) => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
        pictureUrl: page.picture?.data?.url ?? null
      }));
  }

  private async connectFacebookPage(
    auth: AuthUser,
    organizationId: string,
    platform: SocialChannelPlatform,
    page: MetaPageWithToken
  ) {
    const webhookStatus = await this.subscribePageToWebhook(page.id, page.accessToken);

    // TODO: store encrypted Page access token before enabling live Messenger send/receive.
    const result = await withTransaction((client) =>
      client.query<SocialChannelAccount>(
        `
          insert into social_channel_accounts (
            organization_id,
            platform,
            label,
            external_account_id,
            external_account_name,
            profile_picture_url,
            connection_status,
            webhook_status,
            last_sync_at,
            created_by
          )
          values ($1, $2, $3, $4, $5, $6, 'connected', $7, now(), $8)
          on conflict (organization_id, platform, external_account_id)
            where external_account_id is not null
          do update set
            label = excluded.label,
            external_account_name = excluded.external_account_name,
            profile_picture_url = excluded.profile_picture_url,
            connection_status = 'connected',
            webhook_status = excluded.webhook_status,
            last_sync_at = now()
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
          platform,
          page.name,
          page.id,
          page.name,
          page.pictureUrl ?? null,
          webhookStatus,
          auth.organizationUserId
        ]
      )
    );

    return result.rows[0];
  }

  private async subscribePageToWebhook(pageId: string, pageAccessToken: string): Promise<SocialChannelAccount["webhook_status"]> {
    const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${pageId}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads");
    url.searchParams.set("access_token", pageAccessToken);

    try {
      const response = await fetch(url, { method: "POST" });

      return response.ok ? "active" : "failed";
    } catch {
      return "failed";
    }
  }

  private storePageSelection(
    organizationId: string,
    platform: SocialChannelPlatform,
    state: string | undefined,
    pages: MetaPageWithToken[]
  ) {
    this.pruneExpiredPageSelections();
    metaPageSelectionCache.set(this.getPageSelectionCacheKey(organizationId, state), {
      organizationId,
      platform,
      pages,
      expiresAt: Date.now() + META_PAGE_CACHE_TTL_MS
    });
  }

  private getCachedPageSelection(organizationId: string, state: string | null | undefined) {
    this.pruneExpiredPageSelections();
    return metaPageSelectionCache.get(this.getPageSelectionCacheKey(organizationId, state ?? undefined));
  }

  private clearPageSelection(organizationId: string, state: string | null | undefined) {
    metaPageSelectionCache.delete(this.getPageSelectionCacheKey(organizationId, state ?? undefined));
  }

  private pruneExpiredPageSelections() {
    const now = Date.now();
    for (const [key, value] of metaPageSelectionCache.entries()) {
      if (value.expiresAt <= now) {
        metaPageSelectionCache.delete(key);
      }
    }
  }

  private getPageSelectionCacheKey(organizationId: string, state: string | undefined) {
    return `${organizationId}:${state ?? "default"}`;
  }

  private getStateContext(state: string | undefined): { platform: SocialChannelPlatform | null; organizationId: string | null } {
    if (!state) {
      return { platform: null, organizationId: null };
    }

    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
        platform?: unknown;
        organizationId?: unknown;
      };

      return {
        platform: parsed.platform === "facebook" || parsed.platform === "instagram" ? parsed.platform : null,
        organizationId: typeof parsed.organizationId === "string" ? parsed.organizationId : null
      };
    } catch {
      return { platform: null, organizationId: null };
    }
  }

  private toFriendlyMetaError(message: string) {
    const normalized = message.toLowerCase();

    if (normalized.includes("permission") || normalized.includes("access") || normalized.includes("admin")) {
      return "Please login with a Facebook account that is admin of the Page.";
    }

    return "Facebook connection is not ready yet. Please contact your CRM administrator.";
  }

  private async findAccount(auth: AuthUser, accountId: string, requestedOrganizationId?: string | null) {
    const organizationId = this.getOrganizationId(auth, requestedOrganizationId);
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
