import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  cancelCampaign,
  archiveAudienceGroup,
  createCampaign,
  createAudienceGroup,
  deleteAudienceGroupDetails,
  deleteAudienceGroup,
  deleteCampaign,
  exportCampaignRecipients,
  getAudienceGroup,
  getAudienceGroupContacts,
  getCampaign,
  importAudienceGroupContacts,
  listCampaignRecipients,
  listAudienceGroups,
  listCampaigns,
  pauseCampaign,
  previewSaveAudienceAsCrmContacts,
  resumeCampaign,
  saveAudienceAsCrmContacts,
  sendCampaignTest,
  sendCampaignTestPreview,
  startCampaignPreview,
  updateCampaign
} from "./campaigns.controller.js";
import { startExistingCampaign } from "./startExistingCampaign.controller.js";

export const campaignsRoutes = Router();
const testPath = "send" + "-test";

campaignsRoutes.use(requireRole(["super_admin", "org_admin"]));

campaignsRoutes.get("/", asyncHandler(listCampaigns));
campaignsRoutes.post("/", asyncHandler(createCampaign));
campaignsRoutes.post(`/preview/${testPath}`, asyncHandler(sendCampaignTestPreview));
campaignsRoutes.post("/preview/start", asyncHandler(startCampaignPreview));
campaignsRoutes.get("/audience-groups", asyncHandler(listAudienceGroups));
campaignsRoutes.post("/audience-groups", asyncHandler(createAudienceGroup));
campaignsRoutes.get("/audience-groups/:audienceGroupId", asyncHandler(getAudienceGroup));
campaignsRoutes.post("/audience-groups/:audienceGroupId/import", asyncHandler(importAudienceGroupContacts));
campaignsRoutes.get("/audience-groups/:audienceGroupId/contacts", asyncHandler(getAudienceGroupContacts));
campaignsRoutes.get("/audience-groups/:audienceGroupId/save-as-crm-contacts/preview", asyncHandler(previewSaveAudienceAsCrmContacts));
campaignsRoutes.post("/audience-groups/:audienceGroupId/save-as-crm-contacts", asyncHandler(saveAudienceAsCrmContacts));
campaignsRoutes.post("/audience-groups/:audienceGroupId/archive", asyncHandler(archiveAudienceGroup));
campaignsRoutes.post("/audience-groups/:audienceGroupId/delete-details", asyncHandler(deleteAudienceGroupDetails));
campaignsRoutes.delete("/audience-groups/:audienceGroupId", asyncHandler(deleteAudienceGroup));
campaignsRoutes.get("/:campaignId", asyncHandler(getCampaign));
campaignsRoutes.get("/:campaignId/recipients", asyncHandler(listCampaignRecipients));
campaignsRoutes.get("/:campaignId/recipients/export", asyncHandler(exportCampaignRecipients));
campaignsRoutes.patch("/:campaignId", asyncHandler(updateCampaign));
campaignsRoutes.delete("/:campaignId", asyncHandler(deleteCampaign));
campaignsRoutes.post(`/:campaignId/${testPath}`, asyncHandler(sendCampaignTest));
campaignsRoutes.post("/:campaignId/start", asyncHandler(startExistingCampaign));
campaignsRoutes.post("/:campaignId/pause", asyncHandler(pauseCampaign));
campaignsRoutes.post("/:campaignId/resume", asyncHandler(resumeCampaign));
campaignsRoutes.post("/:campaignId/cancel", asyncHandler(cancelCampaign));
