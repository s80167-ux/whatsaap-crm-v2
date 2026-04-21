import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getCurrentPermissions(request: Request, response: Response) {
  const auth = requireAuth(request);

  return response.json({
    data: {
      authUserId: auth.authUserId,
      organizationUserId: auth.organizationUserId,
      organizationId: auth.organizationId,
      role: auth.role,
      permissionKeys: auth.permissionKeys
    }
  });
}
