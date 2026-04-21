import { Router } from "express";
import { sendWhatsAppMessage } from "../controllers/messageController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { whatsappController } from "../controllers/whatsappController.js";

export const whatsappRoutes = Router();

whatsappRoutes.post("/send", asyncHandler(sendWhatsAppMessage));

// Get QR code for WhatsApp account
whatsappRoutes.get("/:id/qr", asyncHandler(whatsappController.getQrCode));
