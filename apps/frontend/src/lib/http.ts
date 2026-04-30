import { config } from "./config";
import { clearAuthSession, getCsrfToken, storeCsrfToken } from "./auth";

function getNetworkErrorMessage() {
  if (config.apiBaseUrl.includes("localhost")) {
    return "Unable to reach the login API. Set VITE_API_BASE_URL to your live backend URL before deploying the frontend.";
  }

  return "Unable to reach the server. Check that the backend is running and that its CORS FRONTEND_URL matches this site URL.";
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 401) {
    clearAuthSession();
  }

  if (response.status === 403 && typeof body === "object" && body && "code" in body && body.code === "csrf_invalid") {
    storeCsrfToken(null);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    if (typeof body === "object" && body && "error" in body && typeof body.error === "string") {
      message = body.error;
    }

    throw new Error(message);
  }

  return body as T;
}

function buildHeaders(method: string) {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (!["GET", "HEAD"].includes(method.toUpperCase()) && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return headers;
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      credentials: "include",
      ...options
    });
  } catch {
    throw new Error(getNetworkErrorMessage());
  }

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string, _includeAuth = true): Promise<T> {
  return request<T>(path, {
    method: "GET",
    headers: buildHeaders("GET")
  });
}

export async function apiPost<T>(path: string, body: unknown, _includeAuth = true): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: buildHeaders("POST"),
    body: JSON.stringify(body)
  });
}

export async function apiPatch<T>(path: string, body: unknown, _includeAuth = true): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: buildHeaders("PATCH"),
    body: JSON.stringify(body)
  });
}

export async function apiDelete<T>(path: string, _includeAuth = true): Promise<T> {
  return request<T>(path, {
    method: "DELETE",
    headers: buildHeaders("DELETE")
  });
}
