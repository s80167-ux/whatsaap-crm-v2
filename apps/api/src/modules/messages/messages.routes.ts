import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import { deleteMessage, forwardMessage, getMessages, sendWhatsAppMessage } from "./messages.controller.js";

export const messageRoutes = Router();

messageRoutes.post("/send", requirePermission("messages.send"), asyncHandler(sendWhatsAppMessage));
messageRoutes.post("/:messageId/forward", requirePermission("messages.send"), asyncHandler(forwardMessage));
messageRoutes.delete("/:messageId", requirePermission("messages.send"), asyncHandler(deleteMessage));
messageRoutes.get(
  "/:conversation_id",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getMessages)
);
