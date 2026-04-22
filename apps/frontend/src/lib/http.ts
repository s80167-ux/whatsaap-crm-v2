import { config } from "./config";
import { clearAuthSession, getAuthToken } from "./auth";

function getNetworkErrorMessage() {
  if (config.apiBaseUrl.includes("localhost")) {
    return "Unable to reach the login API. Set VITE_API_BASE_URL to your live backend URL before deploying the frontend.";
  }

  return "Unable to reach the server. Check that the backend is running and that its CORS FRONTEND_URL matches this site URL.";
}

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
  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: buildHeaders(includeAuth)
    });
  } catch {
    throw new Error(getNetworkErrorMessage());
  }

  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown, includeAuth = true): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "POST",
      headers: buildHeaders(includeAuth),
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(getNetworkErrorMessage());
  }

  return parseResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown, includeAuth = true): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "PATCH",
      headers: buildHeaders(includeAuth),
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(getNetworkErrorMessage());
  }

  return parseResponse<T>(response);
}

export async function apiDelete<T>(path: string, includeAuth = true): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "DELETE",
      headers: buildHeaders(includeAuth)
    });
  } catch {
    throw new Error(getNetworkErrorMessage());
  }

  return parseResponse<T>(response);
}
