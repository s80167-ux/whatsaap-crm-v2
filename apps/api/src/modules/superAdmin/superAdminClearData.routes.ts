import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import {
  ClearOrganizationDataService,
  ConfirmationTextMismatchError,
  OrganizationNotFoundError
} from "./superAdminClearData.service.js";

const organizationIdSchema = z.string().uuid();
const clearDataSchema = z.object({
  confirmationText: z.string().min(1)
});

const clearOrganizationDataService = new ClearOrganizationDataService();

export const superAdminClearDataRoutes = Router();

superAdminClearDataRoutes.use(requireRole(["super_admin"]));

superAdminClearDataRoutes.get(
  "/organizations/:organizationId/clear-data-preview",
  asyncHandler(async (request, response) => {
    const organizationId = organizationIdSchema.parse(request.params.organizationId);

    try {
      const preview = await clearOrganizationDataService.getPreview(organizationId);
      return response.json({ data: preview });
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return response.status(404).json({ error: error.message });
      }

      throw error;
    }
  })
);

superAdminClearDataRoutes.post(
  "/organizations/:organizationId/clear-data",
  asyncHandler(async (request, response) => {
    const organizationId = organizationIdSchema.parse(request.params.organizationId);
    const input = clearDataSchema.parse(request.body);

    try {
      const result = await clearOrganizationDataService.clearOrganizationData({
        organizationId,
        confirmationText: input.confirmationText,
        actorAuthUserId: request.auth?.authUserId ?? null
      });

      return response.json({ data: result });
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return response.status(404).json({ error: error.message });
      }

      if (error instanceof ConfirmationTextMismatchError) {
        return response.status(400).json({ error: error.message });
      }

      throw error;
    }
  })
);
