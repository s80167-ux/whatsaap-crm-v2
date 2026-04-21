import { Router } from "express";
import { getPlatformAuditLogs, getPlatformHealth, getPlatformOrganizations, getPlatformUsage } from "../controllers/platformController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requirePermission, requireRole } from "../middleware/authMiddleware.js";

export const platformRoutes = Router();

platformRoutes.get("/organizations", requireRole(["super_admin"]), requirePermission("platform.manage_organizations"), asyncHandler(getPlatformOrganizations));
platformRoutes.get("/usage", requireRole(["super_admin"]), requirePermission("platform.view_usage"), asyncHandler(getPlatformUsage));
platformRoutes.get("/health", requireRole(["super_admin"]), requirePermission("platform.view_health"), asyncHandler(getPlatformHealth));
platformRoutes.get("/audit-logs", requireRole(["super_admin"]), requirePermission("platform.view_health"), asyncHandler(getPlatformAuditLogs));
