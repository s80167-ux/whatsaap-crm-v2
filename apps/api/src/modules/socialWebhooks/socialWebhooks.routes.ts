import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { receiveMetaWebhook, verifyMetaWebhook } from "./socialWebhooks.controller.js";

export const socialWebhooksRoutes = Router();

socialWebhooksRoutes.get("/meta", asyncHandler(verifyMetaWebhook));
socialWebhooksRoutes.post("/meta", asyncHandler(receiveMetaWebhook));
