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

export type MetaExchangeCodeResponse = {
  enabled: boolean;
  message: string;
};

export async function listSocialChannelAccounts() {
  const response = await apiGet<{ data: SocialChannelAccount[] }>("/social-channels/accounts");
  return response.data;
}

export async function createSocialChannelAccount(input: CreateSocialChannelAccountInput) {
  const response = await apiPost<{ data: SocialChannelAccount }>("/social-channels/accounts", input);
  return response.data;
}

export async function updateSocialChannelAccount(accountId: string, input: UpdateSocialChannelAccountInput) {
  const response = await apiPatch<{ data: SocialChannelAccount }>(`/social-channels/accounts/${accountId}`, input);
  return response.data;
}

export async function getSocialChannelAccountStatus(accountId: string) {
  const response = await apiGet<{ data: SocialChannelAccountStatus }>(`/social-channels/accounts/${accountId}/status`);
  return response.data;
}

export async function disconnectSocialChannelAccount(accountId: string) {
  const response = await apiPost<{ data: SocialChannelAccount }>(`/social-channels/accounts/${accountId}/disconnect`, {});
  return response.data;
}

export async function deleteSocialChannelAccount(accountId: string) {
  return apiDelete<{ ok: true }>(`/social-channels/accounts/${accountId}`);
}

export async function getMetaConnectUrl(platform: SocialChannelPlatform) {
  const response = await apiGet<{ data: MetaConnectUrlResponse }>(`/social-channels/meta/connect-url?platform=${platform}`);
  return response.data;
}

export async function exchangeMetaCode(input: { code?: string; state?: string }) {
  const response = await apiPost<{ data: MetaExchangeCodeResponse }>("/social-channels/meta/exchange-code", input);
  return response.data;
}
