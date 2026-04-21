import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import { getMessages, sendWhatsAppMessage } from "./messages.controller.js";

export const messageRoutes = Router();

messageRoutes.post("/send", requirePermission("messages.send"), asyncHandler(sendWhatsAppMessage));
messageRoutes.get(
  "/:conversation_id",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getMessages)
);
