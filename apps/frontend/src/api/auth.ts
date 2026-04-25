import { apiGet, apiPatch, apiPost } from "../lib/http";
import type { AuthProfile, LoginResponse } from "../types/auth";

export async function login(payload: { email: string; password: string }) {
  const response = await apiPost<{ data: LoginResponse }>("/auth/login", payload, false);
  return response.data;
}

export async function fetchMe() {
  const response = await apiGet<{ data: AuthProfile }>("/auth/me");
  return response.data;
}

export async function updateMyPassword(payload: { password: string }) {
  return apiPost<{ ok: true }>("/auth/me/password", payload);
}

export async function updateMyProfile(payload: { fullName?: string | null; avatarUrl?: string | null; phone?: string | null; address?: string | null }) {
  const response = await apiPatch<{ data: AuthProfile }>("/auth/me", payload);
  return response.data;
}
