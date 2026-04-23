import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  recordQuickReplyUsage,
  updateQuickReply
} from "./quickReplies.controller.js";

export const quickReplyRoutes = Router();

quickReplyRoutes.get("/", asyncHandler(listQuickReplies));
quickReplyRoutes.post("/", requirePermission("org.manage_settings"), asyncHandler(createQuickReply));
quickReplyRoutes.post("/:templateId/usage", asyncHandler(recordQuickReplyUsage));
quickReplyRoutes.patch("/:templateId", requirePermission("org.manage_settings"), asyncHandler(updateQuickReply));
quickReplyRoutes.delete("/:templateId", requirePermission("org.manage_settings"), asyncHandler(deleteQuickReply));
