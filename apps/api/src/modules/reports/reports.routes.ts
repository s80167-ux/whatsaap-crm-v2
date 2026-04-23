import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission } from "../../middleware/authMiddleware.js";
import { getDailyReport } from "./reports.controller.js";

export const reportRoutes = Router();

reportRoutes.get(
  "/daily",
  requireAnyPermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getDailyReport)
);
