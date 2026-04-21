import type { Request } from "express";

export function getRequestAuditContext(request: Request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0]?.trim();

  return {
    ip: forwardedIp ?? request.ip ?? null,
    userAgent: request.header("user-agent") ?? null
  };
}
