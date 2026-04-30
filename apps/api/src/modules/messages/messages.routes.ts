
import { Router } from "express";
import {
  deleteMessage,
  forwardMessage,
  getMessages,
  retryOutboundMessage,
  sendWhatsAppMessage
} from "./messages.controller.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";

export const messagesRoutes = Router();

messagesRoutes.post(
	"/send",
	requirePermission("messages.send"),
	asyncHandler(sendWhatsAppMessage)
);

messagesRoutes.post(
	"/:messageId/retry-dispatch",
	requirePermission("messages.send"),
	asyncHandler(retryOutboundMessage)
);

messagesRoutes.delete(
  "/:messageId",
  requirePermission("messages.send"),
  asyncHandler(deleteMessage)
);

messagesRoutes.post(
  "/:messageId/forward",
  requirePermission("messages.send"),
  asyncHandler(forwardMessage)
);

messagesRoutes.get(
	"/:conversation_id",
	requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
	asyncHandler(getMessages)
);

