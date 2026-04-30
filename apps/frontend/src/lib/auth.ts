import type { AuthProfile } from "../types/auth";

const USER_KEY = "crm_auth_user";
const CSRF_KEY = "crm_csrf_token";

function dispatchAuthUpdated() {
  window.dispatchEvent(new Event("crm_auth_user_updated"));
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

export function storeAuthSession(user: AuthProfile, csrfToken?: string | null) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    storeCsrfToken(csrfToken);

    dispatchAuthUpdated();
  } catch {
    // noop
  }
}

export function updateStoredUser(updater: (user: AuthProfile) => AuthProfile) {
  try {
    const currentUser = getStoredUser();
    if (!currentUser) {
      return;
    }

    localStorage.setItem(USER_KEY, JSON.stringify(updater(currentUser)));
    dispatchAuthUpdated();
  } catch {
    // noop
  }
}

export function getCsrfToken() {
  try {
    return sessionStorage.getItem(CSRF_KEY);
  } catch {
    return null;
  }
}

export function storeCsrfToken(csrfToken: string | null | undefined) {
  try {
    if (csrfToken) {
      sessionStorage.setItem(CSRF_KEY, csrfToken);
    } else {
      sessionStorage.removeItem(CSRF_KEY);
    }
  } catch {
    // noop
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(CSRF_KEY);
    dispatchAuthUpdated();
  } catch {
    // noop
  }
}
