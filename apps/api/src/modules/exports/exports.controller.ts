import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { ExportService, type ExportDataset } from "./exports.service.js";

const exportService = new ExportService();
const auditLogService = new AuditLogService();

const exportParamsSchema = z.object({
  dataset: z.enum(["contacts", "conversations", "messages", "sales", "campaigns"])
});

const exportQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  created_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  created_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  whatsapp_account_id: z.string().uuid().optional(),
  assigned_user_id: z.string().uuid().optional()
});

function requireExportOrganizationId(request: Request, organizationId?: string) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  if (request.auth.role === "super_admin") {
    if (!organizationId) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    return organizationId;
  }

  if (!request.auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return request.auth.organizationId;
}

function getDatasetLabel(dataset: ExportDataset) {
  return dataset.replace(/_/g, " ");
}

export async function downloadExport(request: Request, response: Response) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  const { dataset } = exportParamsSchema.parse(request.params);
  const query = exportQuerySchema.parse(request.query);
  const organizationId = requireExportOrganizationId(request, query.organization_id);

  const exportResult = await exportService.createCsv(dataset, {
    organizationId,
    createdFrom: query.created_from,
    createdTo: query.created_to,
    whatsappAccountId: query.whatsapp_account_id,
    assignedUserId: query.assigned_user_id
  });

  await auditLogService.record(request.auth, {
    organizationId,
    action: "data_export.downloaded",
    entityType: "data_export",
    metadata: {
      dataset,
      label: getDatasetLabel(dataset),
      row_count: exportResult.rowCount,
      filters: {
        created_from: query.created_from ?? null,
        created_to: query.created_to ?? null,
        whatsapp_account_id: query.whatsapp_account_id ?? null,
        assigned_user_id: query.assigned_user_id ?? null
      }
    },
    request: getRequestAuditContext(request)
  });

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
  response.setHeader("X-Export-Row-Count", String(exportResult.rowCount));

  return response.send(exportResult.csv);
}
