import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission, requireRole } from "../../middleware/authMiddleware.js";
import {
  getPlatformAuditLogs,
  getPlatformHealth,
  getPlatformOutboundDispatch,
  getPlatformOrganizations,
  retryPlatformOutboundDispatch,
  getPlatformUsage
} from "./platform.controller.js";

export const platformRoutes = Router();

platformRoutes.get("/organizations", requireRole(["super_admin"]), requirePermission("platform.manage_organizations"), asyncHandler(getPlatformOrganizations));
platformRoutes.get("/usage", requireRole(["super_admin"]), requirePermission("platform.view_usage"), asyncHandler(getPlatformUsage));
platformRoutes.get("/health", requireRole(["super_admin"]), requirePermission("platform.view_health"), asyncHandler(getPlatformHealth));
platformRoutes.get("/outbound-dispatch", requireRole(["super_admin"]), requirePermission("platform.view_health"), asyncHandler(getPlatformOutboundDispatch));
platformRoutes.post("/outbound-dispatch/retry", requireRole(["super_admin"]), requirePermission("platform.view_health"), asyncHandler(retryPlatformOutboundDispatch));
platformRoutes.get("/audit-logs", requireRole(["super_admin"]), requirePermission("platform.view_health"), asyncHandler(getPlatformAuditLogs));
