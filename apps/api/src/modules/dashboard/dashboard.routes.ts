import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import { getAdminDashboard, getAgentDashboard, getSuperAdminDashboard } from "./dashboard.controller.js";

export const dashboardRoutes = Router();

dashboardRoutes.get("/agent", requirePermission("dashboard.view_agent"), asyncHandler(getAgentDashboard));
dashboardRoutes.get("/admin", requirePermission("dashboard.view_admin"), asyncHandler(getAdminDashboard));
dashboardRoutes.get("/super-admin", requirePermission("dashboard.view_super_admin"), asyncHandler(getSuperAdminDashboard));
