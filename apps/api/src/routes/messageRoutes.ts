import { Router } from "express";
import { getMessages, sendWhatsAppMessage } from "../controllers/messageController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../middleware/authMiddleware.js";

export const messageRoutes = Router();

messageRoutes.post("/send", requirePermission("messages.send"), asyncHandler(sendWhatsAppMessage));
messageRoutes.get(
  "/:conversation_id",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getMessages)
);
