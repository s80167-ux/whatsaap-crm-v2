import { Router } from "express";
import { requireAnyPermission } from "../../middleware/authMiddleware.js";
import { getMobileInboxEvents } from "./mobile.controller.js";

export const mobileRoutes = Router();

mobileRoutes.get(
  "/inbox/events",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  getMobileInboxEvents
);
