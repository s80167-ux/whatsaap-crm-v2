import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import { convertLeadToOrder, createLead, getLeadDetail, getLeadHistory, getLeads, updateLead } from "./leads.controller.js";

export const leadRoutes = Router();

leadRoutes.get("/", requireAnyPermission(["sales.read_all", "sales.read_assigned"]), asyncHandler(getLeads));
leadRoutes.get("/:leadId", requireAnyPermission(["sales.read_all", "sales.read_assigned"]), asyncHandler(getLeadDetail));
leadRoutes.get(
  "/:leadId/history",
  requireAnyPermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getLeadHistory)
);
leadRoutes.post("/", requirePermission("sales.write"), asyncHandler(createLead));
leadRoutes.patch("/:leadId", requirePermission("sales.write"), asyncHandler(updateLead));
leadRoutes.post("/:leadId/convert", requirePermission("sales.write"), asyncHandler(convertLeadToOrder));
