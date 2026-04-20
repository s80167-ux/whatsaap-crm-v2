import { apiGet, apiPost } from "../lib/http";
import type { AuthProfile, LoginResponse } from "../types/auth";

export async function login(payload: { email: string; password: string }) {
  const response = await apiPost<{ data: LoginResponse }>("/auth/login", payload, false);
  return response.data;
}

export async function fetchMe() {
  const response = await apiGet<{ data: AuthProfile }>("/auth/me");
  return response.data;
}
