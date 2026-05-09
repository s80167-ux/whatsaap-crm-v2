import { apiGet, apiPatch, apiPost } from "../lib/http";
import { storeAuthSession, storeCsrfToken } from "../lib/auth";
import { config } from "../lib/config";
import type { AuthProfile, LoginResponse } from "../types/auth";

export async function login(payload: { email: string; password: string }) {
  const response = await apiPost<{ data: LoginResponse; csrfToken?: string }>("/auth/login", payload, false);
  storeAuthSession(response.data.user, response.csrfToken ?? null);
  return response.data;
}

export function startGoogleLogin() {
  const startUrl = new URL(`${config.apiBaseUrl}/auth/google/start`);

  if (typeof window !== "undefined") {
    startUrl.searchParams.set("return_to", window.location.origin);
  }

  window.location.assign(startUrl.toString());
}

export async function fetchMe() {
  const response = await apiGet<{ data: AuthProfile; csrfToken?: string }>("/auth/me");
  storeAuthSession(response.data, response.csrfToken ?? null);
  return response.data;
}

export async function updateMyPassword(payload: { password: string }) {
  return apiPost<{ ok: true }>("/auth/me/password", payload);
}

export async function updateMyProfile(payload: { fullName?: string | null; avatarUrl?: string | null; phone?: string | null; address?: string | null }) {
  const response = await apiPatch<{ data: AuthProfile }>("/auth/me", payload);
  return response.data;
}

export async function logout() {
  try {
    await apiPost<{ ok: true }>("/auth/logout", {});
  } finally {
    storeCsrfToken(null);
  }
}
