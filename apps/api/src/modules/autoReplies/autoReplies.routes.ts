import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import { getAutoReplySettings, updateAutoReplySettings } from "./autoReplies.controller.js";

export const autoReplyRoutes = Router();

autoReplyRoutes.get("/settings", requirePermission("org.manage_settings"), asyncHandler(getAutoReplySettings));
autoReplyRoutes.put("/settings", requirePermission("org.manage_settings"), asyncHandler(updateAutoReplySettings));
