import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requirePermission } from "../../middleware/authMiddleware.js";
import { createOrganizationUser, deleteOrganizationUser, listOrganizationUsers } from "./users.controller.js";

export const userRoutes = Router();

userRoutes.get("/", requirePermission("org.manage_users"), asyncHandler(listOrganizationUsers));
userRoutes.post("/", requirePermission("org.manage_users"), asyncHandler(createOrganizationUser));
userRoutes.delete("/:userId", requirePermission("org.manage_users"), asyncHandler(deleteOrganizationUser));
