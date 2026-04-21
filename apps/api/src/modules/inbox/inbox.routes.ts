import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission } from "../../middleware/authMiddleware.js";
import { getInboxThreadMessages, getInboxThreads } from "./inbox.controller.js";

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
