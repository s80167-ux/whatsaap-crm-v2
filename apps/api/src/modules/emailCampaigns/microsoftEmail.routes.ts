import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  disconnectMicrosoft,
  getMicrosoftAuthUrl,
  getMicrosoftStatus,
  handleMicrosoftCallback,
  sendEmailTest
} from "./microsoftEmail.controller.js";

export const microsoftEmailRoutes = Router();

microsoftEmailRoutes.use(requireRole(["super_admin", "org_admin", "manager"]));

microsoftEmailRoutes.get("/microsoft/auth-url", asyncHandler(getMicrosoftAuthUrl));
microsoftEmailRoutes.get("/microsoft/callback", asyncHandler(handleMicrosoftCallback));
microsoftEmailRoutes.get("/microsoft/status", asyncHandler(getMicrosoftStatus));
microsoftEmailRoutes.post("/microsoft/disconnect", asyncHandler(disconnectMicrosoft));
microsoftEmailRoutes.post("/send-test", asyncHandler(sendEmailTest));
