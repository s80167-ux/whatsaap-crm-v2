import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/http";
import type { OrganizationSummary, UserSummary, WhatsAppAccountSummary } from "../types/admin";

export type ContactRepairProposal = {
  id: string;
  organization_id: string;
  contact_id: string;
  status: "pending" | "approved" | "applied" | "rejected" | "cancelled" | string;
  reason: string;
  confidence: "high" | "medium" | "low" | string;
  proposed_action: string;
  before_snapshot: Record<string, unknown>;
  proposed_after_snapshot: Record<string, unknown>;
  repair_plan: Record<string, unknown>;
  detected_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_note?: string | null;
  contact_display_name?: string | null;
  primary_phone_normalized?: string | null;
  primary_phone_e164?: string | null;
};

export type ClearOrganizationDataCounts = {
  users: number;
  whatsappAccounts: number;
  contacts: number;
  conversations: number;
  messages: number;
  sales: number;
  activities: number;
  notifications: number;
  repairProposals: number;
};

export type ClearOrganizationDataPreview = {
  organizationId: string;
  organizationName: string;
  counts: ClearOrganizationDataCounts;
};

type OrganizationApiRecord = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationSummary["status"];
  created_at: string;
};

type UserListApiRecord = UserSummary;

type UserCreateApiRecord = {
  id: string;
  organizationId: string | null;
  authUserId: string | null;
  email: string | null;
  fullName: string | null;
  avatarUrl?: string | null;
  role: UserSummary["role"] | "super_admin";
  status: UserSummary["status"];
};

type WhatsAppAccountApiRecord = {
  id: string;
  organization_id: string;
  created_by?: string | null;
  name: string | null;
  phone_number: string | null;
  phone_number_normalized: string | null;
  status: string;
  display_name?: string | null;
  account_jid?: string | null;
  last_connected_at?: string | null;
  last_disconnected_at?: string | null;
  health_score?: number | null;
  history_sync_lookback_days?: number | null;
};

function mapOrganization(record: OrganizationApiRecord): OrganizationSummary {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    created_at: record.created_at
  };
}

function mapUser(record: UserListApiRecord | UserCreateApiRecord): UserSummary {
  if ("organization_id" in record) {
    return record;
  }

  return {
    id: record.id,
    organization_id: record.organizationId ?? "",
    auth_user_id: record.authUserId,
    email: record.email,
    full_name: record.fullName,
    avatar_url: record.avatarUrl ?? null,
    role: record.role,
    status: record.status,
    created_at: new Date().toISOString()
  };
}

function mapWhatsAppAccount(record: WhatsAppAccountApiRecord): WhatsAppAccountSummary {
  return {
    id: record.id,
    organization_id: record.organization_id,
    created_by: record.created_by ?? null,
    name: record.name ?? record.display_name ?? "Untitled account",
    phone_number: record.phone_number,
    phone_number_normalized: record.phone_number_normalized,
    status: record.status,
    display_name: record.display_name ?? null,
    account_jid: record.account_jid ?? null,
    last_connected_at: record.last_connected_at ?? null,
    last_disconnected_at: record.last_disconnected_at ?? null,
    health_score: record.health_score ?? null,
    history_sync_lookback_days: record.history_sync_lookback_days ?? 7
  };
}

export async function fetchOrganizations() {
  const response = await apiGet<{ data: OrganizationApiRecord[] }>("/organizations");
  return response.data.map(mapOrganization);
}

export async function createOrganization(payload: { name: string; slug?: string | null }) {
  const response = await apiPost<{ data: OrganizationApiRecord }>("/organizations", payload);
  return mapOrganization(response.data);
}

export async function updateOrganization(
  organizationId: string,
  payload: { name: string; slug?: string | null; status?: OrganizationSummary["status"] }
) {
  const response = await apiPatch<{ data: OrganizationApiRecord }>(`/organizations/${organizationId}`, payload);
  return mapOrganization(response.data);
}

export async function deleteOrganization(organizationId: string) {
  return apiDelete<{ ok: true }>(`/organizations/${organizationId}`);
}

export async function fetchUsers(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: UserListApiRecord[] }>(`/admin/users${suffix}`);
  return response.data.map(mapUser);
}

export async function createUser(payload: {
  organizationId?: string | null;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  password: string;
  role: "super_admin" | "org_admin" | "manager" | "user" | "agent";
}) {
  const response = await apiPost<{ data: UserCreateApiRecord }>("/admin/users", payload);
  return mapUser(response.data);
}

export async function updateUser(
  userId: string,
  payload: {
    organizationId?: string | null;
    fullName?: string | null;
    avatarUrl?: string | null;
    role: Exclude<UserSummary["role"], "super_admin">;
    status: UserSummary["status"];
  }
) {
  const response = await apiPatch<{ data: UserListApiRecord }>(`/admin/users/${userId}`, payload);
  return mapUser(response.data);
}

export async function deleteUser(userId: string) {
  return apiDelete<{ ok: true }>(`/admin/users/${userId}`);
}

export async function resetUserPassword(userId: string, payload: { password: string }) {
  return apiPost<{ ok: true }>(`/admin/users/${userId}/reset-password`, payload);
}

export async function fetchWhatsAppAccounts(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: WhatsAppAccountApiRecord[] }>(`/admin/whatsapp-accounts${suffix}`);
  return response.data.map(mapWhatsAppAccount);
}

export async function createWhatsAppAccount(payload: {
  organizationId?: string | null;
  name: string;
  phoneNumber?: string | null;
  historySyncLookbackDays?: number | null;
}) {
  const response = await apiPost<{ data: WhatsAppAccountApiRecord }>("/whatsapp/accounts", payload);
  return mapWhatsAppAccount(response.data);
}

export async function reconnectWhatsAppAccount(accountId: string) {
  const response = await apiPost<{ data: WhatsAppAccountApiRecord }>(`/whatsapp/accounts/${accountId}/reconnect`, {});
  return mapWhatsAppAccount(response.data);
}

export async function backfillWhatsAppAccount(accountId: string, lookbackDays: 7 | 30 | 90) {
  const response = await apiPost<{ data: { account: WhatsAppAccountApiRecord; lookbackDays: number } }>(
    `/admin/whatsapp-accounts/${accountId}/backfill`,
    { lookbackDays }
  );
  return {
    account: mapWhatsAppAccount(response.data.account),
    lookbackDays: response.data.lookbackDays
  };
}

export async function disconnectWhatsAppAccount(accountId: string) {
  const response = await apiPost<{ data: WhatsAppAccountApiRecord }>(`/admin/whatsapp-accounts/${accountId}/disconnect`, {});
  return mapWhatsAppAccount(response.data);
}

export async function updateWhatsAppAccount(
  accountId: string,
  payload: {
    organizationId?: string | null;
    name: string;
    phoneNumber?: string | null;
    historySyncLookbackDays?: number | null;
  }
) {
  const response = await apiPatch<{ data: WhatsAppAccountApiRecord }>(`/admin/whatsapp-accounts/${accountId}`, payload);
  return mapWhatsAppAccount(response.data);
}

export async function deleteWhatsAppAccount(accountId: string) {
  return apiDelete<{ ok: true }>(`/admin/whatsapp-accounts/${accountId}`);
}

export async function fetchClearOrganizationDataPreview(organizationId: string) {
  const response = await apiGet<{ data: ClearOrganizationDataPreview }>(
    `/super-admin/organizations/${organizationId}/clear-data-preview`
  );
  return response.data;
}

export async function clearOrganizationData(organizationId: string, payload: { confirmationText: string }) {
  const response = await apiPost<{
    data: {
      success: true;
      organizationId: string;
      organizationName: string;
      clearedCounts: ClearOrganizationDataCounts;
    };
  }>(`/super-admin/organizations/${organizationId}/clear-data`, payload);
  return response.data;
}

export async function fetchContactRepairProposals(input?: {
  organizationId?: string | null;
  status?: string | null;
}) {
  const searchParams = new URLSearchParams();

  if (input?.organizationId) {
    searchParams.set("organization_id", input.organizationId);
  }

  if (input?.status) {
    searchParams.set("status", input.status);
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const response = await apiGet<{ data: ContactRepairProposal[] }>(`/admin/contact-repair-proposals${query}`);
  return response.data;
}

export async function detectContactRepairProposal(input: {
  contactId: string;
  organizationId?: string | null;
}) {
  const response = await apiPost<{ data: unknown }>(
    `/admin/contacts/${input.contactId}/repair-proposal/detect`,
    {
      organizationId: input.organizationId,
      organization_id: input.organizationId
    }
  );
  return response.data;
}

export async function approveContactRepairProposal(input: {
  proposalId: string;
  organizationId?: string | null;
  note?: string | null;
}) {
  const response = await apiPost<{ data: unknown }>(
    `/admin/contact-repair-proposals/${input.proposalId}/approve`,
    {
      organizationId: input.organizationId,
      organization_id: input.organizationId,
      note: input.note ?? null
    }
  );
  return response.data;
}

export async function rejectContactRepairProposal(input: {
  proposalId: string;
  organizationId?: string | null;
  note?: string | null;
}) {
  const response = await apiPost<{ data: unknown }>(
    `/admin/contact-repair-proposals/${input.proposalId}/reject`,
    {
      organizationId: input.organizationId,
      organization_id: input.organizationId,
      note: input.note ?? null
    }
  );
  return response.data;
}
