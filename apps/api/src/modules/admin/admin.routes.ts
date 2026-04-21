import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission, requireRole } from "../../middleware/authMiddleware.js";
import {
  createWhatsAppAccount,
  deleteWhatsAppAccount,
  getWhatsAppAccountQr,
  listRawEvents,
  listWhatsAppAccounts,
  reconnectWhatsAppAccount,
  replayRawEvents
} from "./admin.controller.js";

export const adminRoutes = Router();

adminRoutes.get("/whatsapp-accounts", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(listWhatsAppAccounts));
adminRoutes.post("/whatsapp-accounts", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(createWhatsAppAccount));
adminRoutes.get("/whatsapp-accounts/:accountId/qr", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(getWhatsAppAccountQr));
adminRoutes.post("/whatsapp-accounts/:accountId/reconnect", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(reconnectWhatsAppAccount));
adminRoutes.delete("/whatsapp-accounts/:accountId", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(deleteWhatsAppAccount));

adminRoutes.get("/raw-events", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(listRawEvents));
adminRoutes.post("/raw-events/replay", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(replayRawEvents));
