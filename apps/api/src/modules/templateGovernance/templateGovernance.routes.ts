import { Router } from "express";
import { requireAnyPermission, requireRole } from "../../middleware/authMiddleware.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import {
  approveVersion,
  archiveTemplate,
  createTemplate,
  createVersion,
  getDiff,
  getSettings,
  getVersion,
  listTemplates,
  listVersions,
  rejectVersion,
  rollbackVersion,
  submitReview,
  updateSettings
} from "./templateGovernance.controller.js";

export const templateGovernanceRoutes = Router();

templateGovernanceRoutes.use(requireRole(["super_admin", "org_admin", "manager"]));

templateGovernanceRoutes.get("/settings", asyncHandler(getSettings));
templateGovernanceRoutes.patch("/settings", requireAnyPermission(["org.manage_settings"]), asyncHandler(updateSettings));

templateGovernanceRoutes.get("/templates", asyncHandler(listTemplates));
templateGovernanceRoutes.post("/templates", requireAnyPermission(["org.manage_settings"]), asyncHandler(createTemplate));
templateGovernanceRoutes.get("/templates/:templateId/versions", asyncHandler(listVersions));
templateGovernanceRoutes.post("/templates/:templateId/versions", requireAnyPermission(["org.manage_settings"]), asyncHandler(createVersion));
templateGovernanceRoutes.get("/templates/:templateId/versions/:versionId", asyncHandler(getVersion));
templateGovernanceRoutes.get("/templates/:templateId/versions/:versionId/diff", asyncHandler(getDiff));
templateGovernanceRoutes.post(
  "/templates/:templateId/versions/:versionId/submit-review",
  requireAnyPermission(["org.manage_settings"]),
  asyncHandler(submitReview)
);
templateGovernanceRoutes.post(
  "/templates/:templateId/versions/:versionId/approve",
  requireAnyPermission(["org.manage_settings"]),
  asyncHandler(approveVersion)
);
templateGovernanceRoutes.post(
  "/templates/:templateId/versions/:versionId/reject",
  requireAnyPermission(["org.manage_settings"]),
  asyncHandler(rejectVersion)
);
templateGovernanceRoutes.post(
  "/templates/:templateId/versions/:versionId/rollback",
  requireAnyPermission(["org.manage_settings"]),
  asyncHandler(rollbackVersion)
);
templateGovernanceRoutes.post("/templates/:templateId/archive", requireAnyPermission(["org.manage_settings"]), asyncHandler(archiveTemplate));
