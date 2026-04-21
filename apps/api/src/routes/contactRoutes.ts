import { Router } from "express";
import { assignContact, getContact, getContacts } from "../controllers/contactController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../middleware/authMiddleware.js";

export const contactRoutes = Router();

contactRoutes.get("/", requireAnyPermission(["contacts.read_all", "contacts.read_assigned"]), asyncHandler(getContacts));
contactRoutes.get("/:contactId", requireAnyPermission(["contacts.read_all", "contacts.read_assigned"]), asyncHandler(getContact));
contactRoutes.post("/:contactId/assign", requirePermission("contacts.write"), asyncHandler(assignContact));
