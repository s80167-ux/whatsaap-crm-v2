import { apiDelete, apiGet, apiPost } from "../lib/http";
import type { OrganizationSummary, UserSummary, WhatsAppAccountSummary } from "../types/admin";

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
  role: UserSummary["role"] | "super_admin";
  status: UserSummary["status"];
};

type WhatsAppAccountApiRecord = {
  id: string;
  organization_id: string;
  name: string | null;
  phone_number: string | null;
  phone_number_normalized: string | null;
  status: string;
  display_name?: string | null;
  account_jid?: string | null;
  last_connected_at?: string | null;
  last_disconnected_at?: string | null;
  health_score?: number | null;
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
    role: record.role,
    status: record.status,
    created_at: new Date().toISOString()
  };
}

function mapWhatsAppAccount(record: WhatsAppAccountApiRecord): WhatsAppAccountSummary {
  return {
    id: record.id,
    organization_id: record.organization_id,
    name: record.name ?? record.display_name ?? "Untitled account",
    phone_number: record.phone_number,
    phone_number_normalized: record.phone_number_normalized,
    status: record.status,
    display_name: record.display_name ?? null,
    account_jid: record.account_jid ?? null,
    last_connected_at: record.last_connected_at ?? null,
    last_disconnected_at: record.last_disconnected_at ?? null,
    health_score: record.health_score ?? null
  };
}

export async function fetchOrganizations() {
  const response = await apiGet<{ data: OrganizationApiRecord[] }>("/admin/organizations");
  return response.data.map(mapOrganization);
}

export async function createOrganization(payload: { name: string; slug?: string | null }) {
  const response = await apiPost<{ data: OrganizationApiRecord }>("/admin/organizations", payload);
  return mapOrganization(response.data);
}

export async function deleteOrganization(organizationId: string) {
  return apiDelete<{ ok: true }>(`/admin/organizations/${organizationId}`);
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
  password: string;
  role: "super_admin" | "org_admin" | "manager" | "user" | "agent";
}) {
  const response = await apiPost<{ data: UserCreateApiRecord }>("/admin/users", payload);
  return mapUser(response.data);
}

export async function deleteUser(userId: string) {
  return apiDelete<{ ok: true }>(`/admin/users/${userId}`);
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
}) {
  const response = await apiPost<{ data: WhatsAppAccountApiRecord }>("/admin/whatsapp-accounts", payload);
  return mapWhatsAppAccount(response.data);
}

export async function reconnectWhatsAppAccount(accountId: string) {
  const response = await apiPost<{ data: WhatsAppAccountApiRecord }>(`/admin/whatsapp-accounts/${accountId}/reconnect`, {});
  return mapWhatsAppAccount(response.data);
}

export async function deleteWhatsAppAccount(accountId: string) {
  return apiDelete<{ ok: true }>(`/admin/whatsapp-accounts/${accountId}`);
}
