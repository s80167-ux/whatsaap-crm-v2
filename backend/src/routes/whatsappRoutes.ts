import { Router } from "express";
import { sendWhatsAppMessage } from "../controllers/messageController.js";

export const whatsappRoutes = Router();

whatsappRoutes.post("/send", sendWhatsAppMessage);
