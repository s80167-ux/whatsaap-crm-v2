import { Router } from "express";
import { requireAnyPermission } from "../../middleware/authMiddleware.js";
import { getMobileInboxEvents } from "./mobile.controller.js";
import { mobileV1Routes } from "./v1/mobileV1.routes.js";

export const mobileRoutes = Router();

mobileRoutes.use("/v1", mobileV1Routes);

mobileRoutes.get(
  "/inbox/events",
  requireAnyPermission(["conversations.read_all", "conversations.read_assigned"]),
  getMobileInboxEvents
);
