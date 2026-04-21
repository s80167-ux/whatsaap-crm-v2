import { Router } from "express";
import { sendWhatsAppMessage } from "../controllers/messageController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const whatsappRoutes = Router();

whatsappRoutes.post("/send", asyncHandler(sendWhatsAppMessage));
