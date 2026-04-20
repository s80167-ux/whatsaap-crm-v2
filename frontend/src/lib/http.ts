import { config } from "./config";
import { clearAuthSession, getAuthToken } from "./auth";

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    clearAuthSession();
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // noop
    }

    throw new Error(message);
  }

  return response.json();
}

function buildHeaders(includeAuth = true) {
  const token = getAuthToken();

  return {
    "Content-Type": "application/json",
    ...(includeAuth && token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function apiGet<T>(path: string, includeAuth = true): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    headers: buildHeaders(includeAuth)
  });

  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown, includeAuth = true): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(includeAuth),
    body: JSON.stringify(body)
  });

  return parseResponse<T>(response);
}
