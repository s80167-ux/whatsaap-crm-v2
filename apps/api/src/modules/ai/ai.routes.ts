import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { assistInbox, assistMessage } from "./ai.controller.js";

export const aiRoutes = Router();

aiRoutes.post("/message-assist", asyncHandler(assistMessage));
aiRoutes.post("/inbox-assist", asyncHandler(assistInbox));
