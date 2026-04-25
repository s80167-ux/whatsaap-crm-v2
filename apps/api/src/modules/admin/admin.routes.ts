import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import {
  detectContactRepairProposal,
  listContactRepairProposals,
  approveContactRepairProposal,
  rejectContactRepairProposal
} from "../../controllers/contactRepairProposalController.js";
import {
  createWhatsAppAccount,
  deleteWhatsAppAccount,
  getWhatsAppAccountQr,
  listRawEvents,
  listWhatsAppAccounts,
  disconnectWhatsAppAccount,
  reconnectWhatsAppAccount,
  replayRawEvents,
  updateWhatsAppAccount
} from "./admin.controller.js";

export const adminRoutes = Router();

adminRoutes.get("/whatsapp-accounts", asyncHandler(listWhatsAppAccounts));
adminRoutes.post("/whatsapp-accounts", asyncHandler(createWhatsAppAccount));
adminRoutes.get("/whatsapp-accounts/:accountId/qr", asyncHandler(getWhatsAppAccountQr));
adminRoutes.patch("/whatsapp-accounts/:accountId", asyncHandler(updateWhatsAppAccount));
adminRoutes.post("/whatsapp-accounts/:accountId/disconnect", asyncHandler(disconnectWhatsAppAccount));
adminRoutes.post("/whatsapp-accounts/:accountId/reconnect", asyncHandler(reconnectWhatsAppAccount));
adminRoutes.delete("/whatsapp-accounts/:accountId", asyncHandler(deleteWhatsAppAccount));

adminRoutes.get("/raw-events", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(listRawEvents));
adminRoutes.post("/raw-events/replay", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(replayRawEvents));

adminRoutes.get(
  "/contact-repair-proposals",
  requirePermission("contacts.write"),
  asyncHandler(listContactRepairProposals)
);

adminRoutes.post(
  "/contacts/:contactId/repair-proposal/detect",
  requirePermission("contacts.write"),
  asyncHandler(detectContactRepairProposal)
);

adminRoutes.post(
  "/contact-repair-proposals/:proposalId/approve",
  requirePermission("contacts.write"),
  asyncHandler(approveContactRepairProposal)
);

adminRoutes.post(
  "/contact-repair-proposals/:proposalId/reject",
  requirePermission("contacts.write"),
  asyncHandler(rejectContactRepairProposal)
);
