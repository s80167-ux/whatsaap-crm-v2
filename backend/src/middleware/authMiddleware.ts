import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types/auth.js";
import { AuthService } from "../services/authService.js";

const authService = new AuthService();

function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = extractBearerToken(request);

  if (!token) {
    return response.status(401).json({ error: "Authentication required" });
  }

  try {
    request.auth = await authService.getAuthUserFromAccessToken(token);
    return next();
  } catch {
    return response.status(401).json({ error: "Invalid or expired token" });
  }
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

export function requireOrganizationContext(request: Request, response: Response, next: NextFunction) {
  if (!request.auth) {
    return response.status(401).json({ error: "Authentication required" });
  }

  if (!request.auth.organizationId && request.auth.role !== "super_admin") {
    return response.status(403).json({ error: "Organization context is missing for this user" });
  }

  return next();
}
