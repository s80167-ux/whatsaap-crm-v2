import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission, requireRole } from "../../middleware/authMiddleware.js";
import { createOrganization, deleteOrganization, listOrganizations, updateOrganization } from "./organizations.controller.js";
import { createOrganizationUser } from "../users/users.controller.js";

export const organizationRoutes = Router();

organizationRoutes.get("/", requireRole(["super_admin"]), asyncHandler(listOrganizations));
organizationRoutes.post("/", requirePermission("platform.manage_organizations"), asyncHandler(createOrganization));
organizationRoutes.patch("/:organizationId", requirePermission("platform.manage_organizations"), asyncHandler(updateOrganization));
organizationRoutes.delete("/:organizationId", requirePermission("platform.manage_organizations"), asyncHandler(deleteOrganization));
organizationRoutes.post("/:organizationId/users", requirePermission("org.manage_users"), asyncHandler(createOrganizationUser));
