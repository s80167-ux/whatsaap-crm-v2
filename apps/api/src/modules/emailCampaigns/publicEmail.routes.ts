import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { unsubscribeEmailToken } from "./emailCampaigns.controller.js";

export const publicEmailRoutes = Router();

publicEmailRoutes.get("/unsubscribe/email/:token", asyncHandler(unsubscribeEmailToken));
publicEmailRoutes.post("/api/public/email-unsubscribe/:token", asyncHandler(unsubscribeEmailToken));