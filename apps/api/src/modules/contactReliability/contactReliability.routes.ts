import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import {
  applyContactSuggestion,
  getContactTimeline,
  getDuplicateMergePreview,
  getReliabilitySummary,
  listDuplicateGroups,
  listRiskyContacts,
  listUnknownContacts,
  mergeDuplicateContacts,
  recalculateReliability,
  revertMerge
} from "./contactReliability.controller.js";

export const contactReliabilityRoutes = Router();

contactReliabilityRoutes.get("/summary", requireAnyPermission(["contacts.read_all"]), asyncHandler(getReliabilitySummary));
contactReliabilityRoutes.get("/risky-contacts", requireAnyPermission(["contacts.read_all"]), asyncHandler(listRiskyContacts));
contactReliabilityRoutes.get("/unknown-contacts", requireAnyPermission(["contacts.read_all"]), asyncHandler(listUnknownContacts));
contactReliabilityRoutes.get("/duplicates", requireAnyPermission(["contacts.read_all"]), asyncHandler(listDuplicateGroups));
contactReliabilityRoutes.get("/contacts/:contactId/timeline", requireAnyPermission(["contacts.read_all"]), asyncHandler(getContactTimeline));

contactReliabilityRoutes.post("/contacts/:contactId/apply-suggestion", requirePermission("contacts.write"), asyncHandler(applyContactSuggestion));
contactReliabilityRoutes.post("/duplicates/:groupKey/merge-preview", requirePermission("contacts.write"), asyncHandler(getDuplicateMergePreview));
contactReliabilityRoutes.post("/duplicates/merge", requirePermission("contacts.write"), asyncHandler(mergeDuplicateContacts));
contactReliabilityRoutes.post("/duplicates/:mergeHistoryId/revert", requirePermission("contacts.write"), asyncHandler(revertMerge));
contactReliabilityRoutes.post("/recalculate", requirePermission("contacts.write"), asyncHandler(recalculateReliability));
