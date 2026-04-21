import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import { assignConversation, getConversations } from "./conversations.controller.js";

export const conversationRoutes = Router();

conversationRoutes.get(
  "/",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getConversations)
);

conversationRoutes.post("/:conversationId/assign", requirePermission("conversations.assign"), asyncHandler(assignConversation));
