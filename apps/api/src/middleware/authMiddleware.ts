import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { clearSessionCookies, setNoStore, setSessionCookies } from "../lib/authCookies.js";
import { AppError } from "../lib/errors.js";
import type { UserRole } from "../types/auth.js";
import { AuthService } from "../services/authService.js";

const authService = new AuthService();
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getCookieValue(request: Request, name: string): string | null {
  const cookieValue = request.cookies?.[name];
  return typeof cookieValue === "string" && cookieValue.length > 0 ? cookieValue : null;
}

function getAuthSessionState(request: Request) {
  return {
    accessToken: getCookieValue(request, env.SESSION_COOKIE_NAME),
    refreshToken: getCookieValue(request, env.REFRESH_COOKIE_NAME),
    csrfToken: getCookieValue(request, env.CSRF_COOKIE_NAME)
  };
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const sessionState = getAuthSessionState(request);

  if (!sessionState.accessToken) {
    if (!sessionState.refreshToken) {
      clearSessionCookies(response);
      return response.status(401).json({ error: "Authentication required", code: "auth_required" });
    }

    try {
      const refreshedSession = await authService.refreshSession(sessionState.refreshToken);
      setSessionCookies(response, {
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken,
        csrfToken: sessionState.csrfToken ?? undefined
      });
      setNoStore(response);
      request.auth = refreshedSession.user;
      request.authSession = {
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken,
        csrfToken: sessionState.csrfToken
      };
      return next();
    } catch {
      clearSessionCookies(response);
      return response.status(401).json({ error: "Invalid or expired session", code: "invalid_session" });
    }
  }

  try {
    request.auth = await authService.getAuthUserFromAccessToken(sessionState.accessToken);
    request.authSession = {
      accessToken: sessionState.accessToken,
      refreshToken: sessionState.refreshToken,
      csrfToken: sessionState.csrfToken
    };
    return next();
  } catch (error) {
    if (!sessionState.refreshToken) {
      clearSessionCookies(response);
      return response.status(401).json({ error: "Invalid or expired token", code: "invalid_token" });
    }

    try {
      const refreshedSession = await authService.refreshSession(sessionState.refreshToken);
      setSessionCookies(response, {
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken,
        csrfToken: sessionState.csrfToken ?? undefined
      });
      setNoStore(response);
      request.auth = refreshedSession.user;
      request.authSession = {
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken,
        csrfToken: sessionState.csrfToken
      };
      return next();
    } catch {
      clearSessionCookies(response);
      return response.status(401).json({ error: "Invalid or expired session", code: "invalid_session" });
    }
  }
}

export function requireCsrf(request: Request, _response: Response, next: NextFunction) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return next();
  }

  const csrfCookie = getCookieValue(request, env.CSRF_COOKIE_NAME);
  const csrfHeader = request.header("X-CSRF-Token");

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return next(new AppError("Invalid CSRF token", 403, "csrf_invalid"));
  }

  return next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(request.auth.role)) {
      return response.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}

export function requirePermission(permissionKey: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({ error: "Authentication required" });
    }

    if (request.auth.role === "super_admin") {
      return next();
    }

    if (!request.auth.permissionKeys.includes(permissionKey)) {
      return response.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}

export function requireAnyPermission(permissionKeys: string[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({ error: "Authentication required" });
    }

    if (request.auth.role === "super_admin") {
      return next();
    }

    const hasPermission = permissionKeys.some((permissionKey) => request.auth?.permissionKeys.includes(permissionKey));

    if (!hasPermission) {
      return response.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}

export function requireOrganizationContext(request: Request, response: Response, next: NextFunction) {
  if (!request.auth) {
    return response.status(401).json({ error: "Authentication required" });
  }

  if (!request.auth.organizationId && request.auth.role !== "super_admin") {
    return response.status(403).json({ error: "Organization context is missing for this user" });
  }

  return next();
}
