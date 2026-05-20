import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requireRole } from "../../middleware/authMiddleware.js";
import {
  checkContentRisk,
  createOptOut,
  getCampaignPrecheck,
  getSafetySettings,
  listOptOuts,
  overrideCampaignWarnings,
  updateOptOut,
  updateSafetySettings,
  validateCampaignRecipients
} from "./campaignSafety.controller.js";

export const campaignSafetyRoutes = Router();

campaignSafetyRoutes.use(requireRole(["super_admin", "org_admin", "manager"]));

campaignSafetyRoutes.get("/campaigns/:campaignId/precheck", asyncHandler(getCampaignPrecheck));
campaignSafetyRoutes.post(
  "/campaigns/:campaignId/validate-recipients",
  requireAnyPermission(["org.manage_settings"]),
  asyncHandler(validateCampaignRecipients)
);
campaignSafetyRoutes.post("/content-check", asyncHandler(checkContentRisk));
campaignSafetyRoutes.get("/settings", asyncHandler(getSafetySettings));
campaignSafetyRoutes.patch("/settings", requireAnyPermission(["org.manage_settings"]), asyncHandler(updateSafetySettings));
campaignSafetyRoutes.get("/opt-outs", asyncHandler(listOptOuts));
campaignSafetyRoutes.post("/opt-outs", requireAnyPermission(["org.manage_settings"]), asyncHandler(createOptOut));
campaignSafetyRoutes.patch("/opt-outs/:id", requireAnyPermission(["org.manage_settings"]), asyncHandler(updateOptOut));
campaignSafetyRoutes.post(
  "/campaigns/:campaignId/override-warning",
  requireAnyPermission(["org.manage_settings"]),
  asyncHandler(overrideCampaignWarnings)
);
