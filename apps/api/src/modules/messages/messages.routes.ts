import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import { deleteMessage, forwardMessage, getMessages, sendWhatsAppMessage } from "./messages.controller.js";
import { MessageDispatchService } from "../../services/messageDispatchService.js";

export const messageRoutes = Router();
const messageDispatchService = new MessageDispatchService();

messageRoutes.post("/send", requirePermission("messages.send"), asyncHandler(sendWhatsAppMessage));
messageRoutes.post("/:messageId/forward", requirePermission("messages.send"), asyncHandler(forwardMessage));
messageRoutes.delete("/:messageId", requirePermission("messages.send"), asyncHandler(deleteMessage));

messageRoutes.post("/:messageId/retry-dispatch", requirePermission("messages.send"), asyncHandler(async (req, res) => {
  const messageId = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;

  if (!messageId) {
    return res.status(400).json({
      error: "messageId is required"
    });
  }

  const organizationId = req.auth?.organizationId;

  if (!organizationId) {
    return res.status(400).json({
      error: "organization_id is required"
    });
  }

  const result = await messageDispatchService.retryMessage({
    messageId,
    organizationId
  });

  if (!result.ok) {
    return res.status(404).json({
      error: result.reason
    });
  }

  return res.json({
    ok: true,
    data: result
  });
}));

messageRoutes.get(
  "/:conversation_id",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getMessages)
);
