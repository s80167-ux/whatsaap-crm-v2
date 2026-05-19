import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import { sendSocialMessage } from "./socialMessages.controller.js";

export const socialMessagesRoutes = Router();

socialMessagesRoutes.post(
  "/send",
  requirePermission("messages.send"),
  asyncHandler(sendSocialMessage)
);
