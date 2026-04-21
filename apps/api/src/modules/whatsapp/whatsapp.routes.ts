import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import { sendWhatsAppMessage } from "./whatsapp.controller.js";
import { createWhatsAppAccount, getWhatsAppAccountQr, reconnectWhatsAppAccount } from "./whatsappAccounts.controller.js";

export const whatsappRoutes = Router();

whatsappRoutes.post("/send", requirePermission("messages.send"), asyncHandler(sendWhatsAppMessage));
whatsappRoutes.post("/accounts", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(createWhatsAppAccount));
whatsappRoutes.post("/accounts/:accountId/reconnect", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(reconnectWhatsAppAccount));
whatsappRoutes.get("/:accountId/qr", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(getWhatsAppAccountQr));
