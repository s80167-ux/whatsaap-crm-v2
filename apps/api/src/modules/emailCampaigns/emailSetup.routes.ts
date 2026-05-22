import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  createSender,
  deleteSender,
  disableSender,
  listSenders,
  testSender,
  updateSender
} from "./emailCampaigns.controller.js";
import { detectSmtpSettings, testSmtpConfig } from "./smtpSetup.controller.js";

export const emailSetupRoutes = Router();

emailSetupRoutes.use(requireRole(["super_admin", "org_admin", "manager"]));

emailSetupRoutes.post("/smtp/detect", asyncHandler(detectSmtpSettings));
emailSetupRoutes.post("/smtp/test-config", asyncHandler(testSmtpConfig));
emailSetupRoutes.get("/senders", asyncHandler(listSenders));
emailSetupRoutes.post("/senders", asyncHandler(createSender));
emailSetupRoutes.patch("/senders/:senderId", asyncHandler(updateSender));
emailSetupRoutes.patch("/senders/:senderId/disable", asyncHandler(disableSender));
emailSetupRoutes.post("/senders/:senderId/test", asyncHandler(testSender));
emailSetupRoutes.delete("/senders/:senderId", asyncHandler(deleteSender));
