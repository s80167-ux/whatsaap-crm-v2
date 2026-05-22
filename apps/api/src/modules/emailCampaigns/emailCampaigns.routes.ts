import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  cancelCampaign,
  createCampaign,
  createSuppression,
  deleteSuppression,
  getCampaign,
  getCampaignHistory,
  getCampaignReport,
  listCampaignRecipients,
  listCampaigns,
  listSuppressionList,
  pauseCampaign,
  sendCampaignTest,
  startCampaign,
  updateCampaign,
} from "./emailCampaigns.controller.js";

export const emailCampaignRoutes = Router();

emailCampaignRoutes.use(requireRole(["super_admin", "org_admin", "manager"]));

emailCampaignRoutes.get("/suppression-list", asyncHandler(listSuppressionList));
emailCampaignRoutes.post("/suppression-list", asyncHandler(createSuppression));
emailCampaignRoutes.delete("/suppression-list/:id", asyncHandler(deleteSuppression));

emailCampaignRoutes.get("/history", asyncHandler(getCampaignHistory));
emailCampaignRoutes.get("/", asyncHandler(listCampaigns));
emailCampaignRoutes.post("/", asyncHandler(createCampaign));
emailCampaignRoutes.get("/:campaignId", asyncHandler(getCampaign));
emailCampaignRoutes.patch("/:campaignId", asyncHandler(updateCampaign));
emailCampaignRoutes.post("/:campaignId/send-test", asyncHandler(sendCampaignTest));
emailCampaignRoutes.post("/:campaignId/start", asyncHandler(startCampaign));
emailCampaignRoutes.post("/:campaignId/pause", asyncHandler(pauseCampaign));
emailCampaignRoutes.post("/:campaignId/cancel", asyncHandler(cancelCampaign));
emailCampaignRoutes.get("/:campaignId/recipients", asyncHandler(listCampaignRecipients));
emailCampaignRoutes.get("/:campaignId/report", asyncHandler(getCampaignReport));
