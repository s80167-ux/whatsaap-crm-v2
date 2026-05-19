import { apiDelete, apiGet, apiPatch, apiPost } from "./http";

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

export type SocialChannelAccountStatus = Pick<
  SocialChannelAccount,
  "id" | "platform" | "connection_status" | "webhook_status" | "last_sync_at" | "updated_at"
>;

export type CreateSocialChannelAccountInput = {
  platform: SocialChannelPlatform;
  label: string;
  externalAccountName?: string | null;
  externalAccountId?: string | null;
  username?: string | null;
};

export type UpdateSocialChannelAccountInput = Omit<CreateSocialChannelAccountInput, "platform">;

export type MetaConnectUrlResponse = {
  configured: boolean;
  url: string | null;
  missingConfig: string[];
  message: string;
};

export type MetaPageOption = {
  id: string;
  name: string;
  pictureUrl?: string | null;
};

function organizationQuery(organizationId?: string | null) {
  return organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
}

function appendOrganizationQuery(path: string, organizationId?: string | null) {
  if (!organizationId) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}organization_id=${encodeURIComponent(organizationId)}`;
}

export type MetaExchangeCodeResponse = {
  enabled?: boolean;
  success?: boolean;
  message: string;
  account?: SocialChannelAccount | null;
  requiresPageSelection?: boolean;
  pages?: MetaPageOption[];
};

export async function listSocialChannelAccounts(organizationId?: string | null) {
  const response = await apiGet<{ data: SocialChannelAccount[] }>(`/social-channels/accounts${organizationQuery(organizationId)}`);
  return response.data;
}

export async function createSocialChannelAccount(input: CreateSocialChannelAccountInput & { organizationId?: string | null }) {
  const response = await apiPost<{ data: SocialChannelAccount }>("/social-channels/accounts", input);
  return response.data;
}

export async function updateSocialChannelAccount(accountId: string, input: UpdateSocialChannelAccountInput & { organizationId?: string | null }) {
  const response = await apiPatch<{ data: SocialChannelAccount }>(`/social-channels/accounts/${accountId}`, input);
  return response.data;
}

export async function getSocialChannelAccountStatus(accountId: string, organizationId?: string | null) {
  const response = await apiGet<{ data: SocialChannelAccountStatus }>(appendOrganizationQuery(`/social-channels/accounts/${accountId}/status`, organizationId));
  return response.data;
}

export async function disconnectSocialChannelAccount(accountId: string, organizationId?: string | null) {
  const response = await apiPost<{ data: SocialChannelAccount }>(`/social-channels/accounts/${accountId}/disconnect`, { organizationId });
  return response.data;
}

export async function resubscribeSocialChannelAccount(accountId: string, organizationId?: string | null) {
  const response = await apiPost<{ data: SocialChannelAccount }>(`/social-channels/accounts/${accountId}/resubscribe`, { organizationId });
  return response.data;
}

export async function deleteSocialChannelAccount(accountId: string, organizationId?: string | null) {
  return apiDelete<{ ok: true }>(appendOrganizationQuery(`/social-channels/accounts/${accountId}`, organizationId));
}

export async function getMetaConnectUrl(platform: SocialChannelPlatform, organizationId?: string | null) {
  const response = await apiGet<{ data: MetaConnectUrlResponse }>(appendOrganizationQuery(`/social-channels/meta/connect-url?platform=${platform}`, organizationId));
  return response.data;
}

export async function exchangeMetaCode(input: { code?: string; state?: string }) {
  const response = await apiPost<{ data: MetaExchangeCodeResponse }>("/social-channels/meta/exchange-code", input);
  return response.data;
}

export async function connectMetaPage(input: {
  platform: SocialChannelPlatform;
  pageId: string;
  state?: string | null;
}) {
  const response = await apiPost<{ data: MetaExchangeCodeResponse }>("/social-channels/meta/connect-page", input);
  return response.data;
}
