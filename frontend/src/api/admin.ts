import { apiGet, apiPost } from "../lib/http";
import type { OrganizationSummary, UserSummary, WhatsAppAccountSummary } from "../types/admin";

export async function fetchOrganizations() {
  const response = await apiGet<{ data: OrganizationSummary[] }>("/admin/organizations");
  return response.data;
}

export async function createOrganization(payload: { name: string; slug?: string | null }) {
  const response = await apiPost<{ data: OrganizationSummary }>("/admin/organizations", payload);
  return response.data;
}

export async function fetchUsers(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: UserSummary[] }>(`/admin/users${suffix}`);
  return response.data;
}

export async function createUser(payload: {
  organizationId?: string | null;
  email: string;
  fullName?: string | null;
  password: string;
  role: "super_admin" | "org_admin" | "manager" | "user" | "agent";
}) {
  const response = await apiPost<{ data: UserSummary }>("/admin/users", payload);
  return response.data;
}

export async function fetchWhatsAppAccounts(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: WhatsAppAccountSummary[] }>(`/admin/whatsapp-accounts${suffix}`);
  return response.data;
}

export async function createWhatsAppAccount(payload: {
  organizationId?: string | null;
  name: string;
  phoneNumber?: string | null;
  baileysSessionKey?: string | null;
}) {
  const response = await apiPost<{ data: WhatsAppAccountSummary }>("/admin/whatsapp-accounts", payload);
  return response.data;
}
