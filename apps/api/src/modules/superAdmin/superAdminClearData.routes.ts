import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRole } from "../../middleware/authMiddleware.js";
import { AuditLogService } from "../../services/auditLogService.js";
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
const auditLogService = new AuditLogService();

export const superAdminClearDataRoutes = Router();

superAdminClearDataRoutes.use(requireRole(["super_admin"]));

superAdminClearDataRoutes.get(
  "/audit-logs",
  asyncHandler(async (request, response) => {
    const organizationId = typeof request.query.organization_id === "string" ? request.query.organization_id : null;
    const logs = await auditLogService.list({
      organizationId,
      actionPrefix: "organization_data_clear_",
      limit: 100
    });

    return response.json({ data: logs });
  })
);

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
