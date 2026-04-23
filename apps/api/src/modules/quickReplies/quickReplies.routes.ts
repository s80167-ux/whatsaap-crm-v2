import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply
} from "./quickReplies.controller.js";

export const quickReplyRoutes = Router();

quickReplyRoutes.get("/", asyncHandler(listQuickReplies));
quickReplyRoutes.post("/", requirePermission("org.manage_settings"), asyncHandler(createQuickReply));
quickReplyRoutes.patch("/:templateId", requirePermission("org.manage_settings"), asyncHandler(updateQuickReply));
quickReplyRoutes.delete("/:templateId", requirePermission("org.manage_settings"), asyncHandler(deleteQuickReply));
