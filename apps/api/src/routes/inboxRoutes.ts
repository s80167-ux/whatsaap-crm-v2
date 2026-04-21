import { Router } from "express";
import { getInboxThreadMessages, getInboxThreads } from "../controllers/inboxController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAnyPermission } from "../middleware/authMiddleware.js";

export const inboxRoutes = Router();

inboxRoutes.get(
  "/threads",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getInboxThreads)
);

inboxRoutes.get(
  "/threads/:conversationId/messages",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  asyncHandler(getInboxThreadMessages)
);
