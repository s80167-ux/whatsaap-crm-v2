import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  cancelCampaign,
  createCampaign,
  createSender,
  createSuppression,
  deleteSuppression,
  disableSender,
  getCampaign,
  getCampaignHistory,
  getCampaignReport,
  listCampaignRecipients,
  listCampaigns,
  listSenders,
  listSuppressionList,
  pauseCampaign,
  sendCampaignTest,
  startCampaign,
  testSender,
  updateCampaign,
  updateSender
} from "./emailCampaigns.controller.js";

export const emailCampaignRoutes = Router();

emailCampaignRoutes.use(requireRole(["super_admin", "org_admin", "manager"]));

emailCampaignRoutes.get("/senders", asyncHandler(listSenders));
emailCampaignRoutes.post("/senders", asyncHandler(createSender));
emailCampaignRoutes.patch("/senders/:senderId", asyncHandler(updateSender));
emailCampaignRoutes.post("/senders/:senderId/test", asyncHandler(testSender));
emailCampaignRoutes.delete("/senders/:senderId", asyncHandler(disableSender));

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