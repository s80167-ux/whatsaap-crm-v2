import { Router } from "express";
import {
  createOrganization,
  createOrganizationUser,
  createWhatsAppAccount,
  listOrganizations,
  listOrganizationUsers,
  listWhatsAppAccounts
} from "../controllers/adminController.js";
import { requirePermission, requireRole } from "../middleware/authMiddleware.js";

export const adminRoutes = Router();

adminRoutes.get("/organizations", requireRole(["super_admin"]), listOrganizations);
adminRoutes.post("/organizations", requirePermission("platform.manage_organizations"), createOrganization);

adminRoutes.get("/users", requirePermission("org.manage_users"), listOrganizationUsers);
adminRoutes.post("/users", requirePermission("org.manage_users"), createOrganizationUser);

adminRoutes.get("/whatsapp-accounts", requirePermission("org.manage_whatsapp_accounts"), listWhatsAppAccounts);
adminRoutes.post("/whatsapp-accounts", requirePermission("org.manage_whatsapp_accounts"), createWhatsAppAccount);
