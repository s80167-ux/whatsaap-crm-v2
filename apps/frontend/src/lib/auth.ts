import type { AuthProfile, LoginResponse } from "../types/auth";

const TOKEN_KEY = "crm_auth_token";
const USER_KEY = "crm_auth_user";

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthProfile | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthProfile) : null;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function storeAuthSession(session: LoginResponse) {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  } catch {
    // noop
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // noop
  }
}
