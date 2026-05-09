import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  createCampaign,
  createAudienceGroup,
  deleteAudienceGroup,
  getAudienceGroup,
  getAudienceGroupContacts,
  getCampaign,
  importAudienceGroupContacts,
  listAudienceGroups,
  listCampaigns,
  sendCampaignTest,
  sendCampaignTestPreview,
  startCampaign,
  startCampaignPreview,
  updateCampaign
} from "./campaigns.controller.js";

export const campaignsRoutes = Router();

campaignsRoutes.use(requireRole(["super_admin", "org_admin"]));

campaignsRoutes.get("/", asyncHandler(listCampaigns));
campaignsRoutes.post("/", asyncHandler(createCampaign));
campaignsRoutes.post("/preview/send-test", asyncHandler(sendCampaignTestPreview));
campaignsRoutes.post("/preview/start", asyncHandler(startCampaignPreview));
campaignsRoutes.get("/audience-groups", asyncHandler(listAudienceGroups));
campaignsRoutes.post("/audience-groups", asyncHandler(createAudienceGroup));
campaignsRoutes.get("/audience-groups/:audienceGroupId", asyncHandler(getAudienceGroup));
campaignsRoutes.post("/audience-groups/:audienceGroupId/import", asyncHandler(importAudienceGroupContacts));
campaignsRoutes.get("/audience-groups/:audienceGroupId/contacts", asyncHandler(getAudienceGroupContacts));
campaignsRoutes.delete("/audience-groups/:audienceGroupId", asyncHandler(deleteAudienceGroup));
campaignsRoutes.get("/:campaignId", asyncHandler(getCampaign));
campaignsRoutes.patch("/:campaignId", asyncHandler(updateCampaign));
campaignsRoutes.post("/:campaignId/send-test", asyncHandler(sendCampaignTest));
campaignsRoutes.post("/:campaignId/start", asyncHandler(startCampaign));
