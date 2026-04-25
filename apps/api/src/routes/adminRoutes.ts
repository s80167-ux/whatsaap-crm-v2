import { Router } from "express";
import {
  createOrganization,
  createOrganizationUser,
  createWhatsAppAccount,
  deleteOrganization,
  deleteOrganizationUser,
  deleteWhatsAppAccount,
  listOrganizations,
  listRawEvents,
  listOrganizationUsers,
  listWhatsAppAccounts,
  replayRawEvents,
  reconnectWhatsAppAccount
} from "../controllers/adminController.js";

import { asyncHandler } from "../middleware/asyncHandler.js";
import { requirePermission, requireRole } from "../middleware/authMiddleware.js";
import { refreshContactIdentity, applyCanonicalOverride } from "../controllers/contactIdentityRepairController.js";

export const adminRoutes = Router();

adminRoutes.get("/organizations", requireRole(["super_admin"]), asyncHandler(listOrganizations));
adminRoutes.post("/organizations", requirePermission("platform.manage_organizations"), asyncHandler(createOrganization));
adminRoutes.delete("/organizations/:organizationId", requirePermission("platform.manage_organizations"), asyncHandler(deleteOrganization));

adminRoutes.get("/users", requirePermission("org.manage_users"), asyncHandler(listOrganizationUsers));
adminRoutes.post("/users", requirePermission("org.manage_users"), asyncHandler(createOrganizationUser));
adminRoutes.delete("/users/:userId", requirePermission("org.manage_users"), asyncHandler(deleteOrganizationUser));

adminRoutes.get("/whatsapp-accounts", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(listWhatsAppAccounts));
adminRoutes.post("/whatsapp-accounts", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(createWhatsAppAccount));
adminRoutes.post("/whatsapp-accounts/:accountId/reconnect", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(reconnectWhatsAppAccount));
adminRoutes.delete("/whatsapp-accounts/:accountId", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(deleteWhatsAppAccount));
adminRoutes.get("/raw-events", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(listRawEvents));
adminRoutes.post("/raw-events/replay", requirePermission("org.manage_whatsapp_accounts"), asyncHandler(replayRawEvents));

adminRoutes.post(
  "/contacts/:contactId/refresh",
  requirePermission("contacts.write"),
  asyncHandler(refreshContactIdentity)
);
adminRoutes.post(
  "/contacts/:contactId/corrections/apply",
  requirePermission("contacts.write"),
  asyncHandler(applyCanonicalOverride)
);
