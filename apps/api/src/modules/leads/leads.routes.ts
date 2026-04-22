import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import { convertLeadToOrder, createLead, getLeads } from "./leads.controller.js";

export const leadRoutes = Router();

leadRoutes.get("/", requireAnyPermission(["sales.read_all", "sales.read_assigned"]), asyncHandler(getLeads));
leadRoutes.post("/", requirePermission("sales.write"), asyncHandler(createLead));
leadRoutes.post("/:leadId/convert", requirePermission("sales.write"), asyncHandler(convertLeadToOrder));
