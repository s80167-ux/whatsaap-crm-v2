import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import {
  assignContact,
  createContact,
  getContact,
  getContacts,
  mergeContacts,
  startContactConversation,
  updateContact
} from "./contacts.controller.js";

export const contactRoutes = Router();

contactRoutes.get("/", requireAnyPermission(["contacts.read_all", "contacts.read_assigned"]), asyncHandler(getContacts));
contactRoutes.post("/", requirePermission("contacts.write"), asyncHandler(createContact));
contactRoutes.post("/merge", requirePermission("contacts.write"), asyncHandler(mergeContacts));
contactRoutes.get("/:contactId", requireAnyPermission(["contacts.read_all", "contacts.read_assigned"]), asyncHandler(getContact));
contactRoutes.patch("/:contactId", requirePermission("contacts.write"), asyncHandler(updateContact));
contactRoutes.post("/:contactId/assign", requirePermission("contacts.write"), asyncHandler(assignContact));
contactRoutes.post("/:contactId/conversation", requirePermission("messages.send"), asyncHandler(startContactConversation));
