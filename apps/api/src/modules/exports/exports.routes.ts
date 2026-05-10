import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import { downloadExport } from "./exports.controller.js";

export const exportRoutes = Router();

exportRoutes.get(
  "/:dataset",
  requireRole(["super_admin", "org_admin"]),
  asyncHandler(downloadExport)
);
