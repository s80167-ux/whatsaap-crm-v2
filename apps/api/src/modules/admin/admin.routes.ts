import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission, requireRole } from "../../middleware/authMiddleware.js";
import {
  backfillWhatsAppAccount,
  backfillWhatsAppHistory,
  fullSyncWhatsAppAccount,
  getLatestWhatsAppSyncJob,
  getWhatsAppSyncJob,
  syncWhatsAppContacts
} from "../../controllers/adminBackfillController.js";
import {
  detectContactRepairProposal,
  listContactRepairProposals,
  approveContactRepairProposal,
  rejectContactRepairProposal
} from "../../controllers/contactRepairProposalController.js";
import {
  createWhatsAppAccount,
  deleteWhatsAppAccount,
  enableWhatsAppNumberWarmer,
  getWhatsAppNumberWarmer,
  getWhatsAppAccountQr,
  approveGoogleSignupRequest,
  listGoogleSignupRequests,
  listRawEvents,
  listWhatsAppNumberWarmerLogs,
  listWhatsAppAccounts,
  listWhatsAppAccountAccess,
  getWhatsAppAccountAccess,
  disconnectWhatsAppAccount,
  getCampaignsModuleStatus,
  getOrganizationAccessLimits,
  getRolePermissions,
  listRolePermissions,
  pauseWhatsAppNumberWarmer,
  reconnectWhatsAppAccount,
  resumeWhatsAppNumberWarmer,
  resetWhatsAppAccountPairing,
  rejectGoogleSignupRequest,
  replayRawEvents,
  saveWhatsAppNumberWarmer,
  startWhatsAppNumberWarmer,
  updateRolePermissions,
  updateOrganizationAccessLimits,
  updateWhatsAppAccountAccess,
  updateWhatsAppAccount
} from "./admin.controller.js";

export const adminRoutes = Router();

adminRoutes.get("/roles/permissions", requireRole(["super_admin"]), asyncHandler(listRolePermissions));
adminRoutes.get("/roles/:role/permissions", requireRole(["super_admin"]), asyncHandler(getRolePermissions));
adminRoutes.put("/roles/:role/permissions", requireRole(["super_admin"]), asyncHandler(updateRolePermissions));

adminRoutes.get("/organization-modules/:moduleKey/status", asyncHandler(getCampaignsModuleStatus));
adminRoutes.get("/organizations/:organizationId/access-limits", asyncHandler(getOrganizationAccessLimits));
adminRoutes.patch(
  "/organizations/:organizationId/access-limits",
  requirePermission("platform.manage_organizations"),
  asyncHandler(updateOrganizationAccessLimits)
);
adminRoutes.get("/google-signup-requests", requirePermission("platform.manage_organizations"), asyncHandler(listGoogleSignupRequests));
adminRoutes.post(
  "/google-signup-requests/:requestId/approve",
  requirePermission("platform.manage_organizations"),
  asyncHandler(approveGoogleSignupRequest)
);
adminRoutes.post(
  "/google-signup-requests/:requestId/reject",
  requirePermission("platform.manage_organizations"),
  asyncHandler(rejectGoogleSignupRequest)
);

adminRoutes.get("/whatsapp-accounts", asyncHandler(listWhatsAppAccounts));
adminRoutes.get("/whatsapp-account-access", asyncHandler(listWhatsAppAccountAccess));
adminRoutes.get("/whatsapp-account-access/:whatsappAccountId", asyncHandler(getWhatsAppAccountAccess));
adminRoutes.put(
  "/whatsapp-account-access/:whatsappAccountId",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(updateWhatsAppAccountAccess)
);
adminRoutes.post(
  "/whatsapp-accounts",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(createWhatsAppAccount)
);
adminRoutes.get("/whatsapp-accounts/:accountId/qr", asyncHandler(getWhatsAppAccountQr));
adminRoutes.get(
  "/whatsapp-accounts/:accountId/warmer",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(getWhatsAppNumberWarmer)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/warmer/enable",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(enableWhatsAppNumberWarmer)
);
adminRoutes.patch(
  "/whatsapp-accounts/:accountId/warmer",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(saveWhatsAppNumberWarmer)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/warmer/start",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(startWhatsAppNumberWarmer)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/warmer/pause",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(pauseWhatsAppNumberWarmer)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/warmer/resume",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(resumeWhatsAppNumberWarmer)
);
adminRoutes.get(
  "/whatsapp-accounts/:accountId/warmer/logs",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(listWhatsAppNumberWarmerLogs)
);
adminRoutes.patch(
  "/whatsapp-accounts/:accountId",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(updateWhatsAppAccount)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/disconnect",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(disconnectWhatsAppAccount)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/reconnect",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(reconnectWhatsAppAccount)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/reset-pairing",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(resetWhatsAppAccountPairing)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/backfill",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(backfillWhatsAppAccount)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/sync-contacts",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(syncWhatsAppContacts)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/backfill-history",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(backfillWhatsAppHistory)
);
adminRoutes.post(
  "/whatsapp-accounts/:accountId/full-sync",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(fullSyncWhatsAppAccount)
);
adminRoutes.get(
  "/whatsapp-sync-jobs/latest",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(getLatestWhatsAppSyncJob)
);
adminRoutes.get(
  "/whatsapp-sync-jobs/:jobId",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(getWhatsAppSyncJob)
);
adminRoutes.delete(
  "/whatsapp-accounts/:accountId",
  requirePermission("org.manage_whatsapp_accounts"),
  asyncHandler(deleteWhatsAppAccount)
);

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
