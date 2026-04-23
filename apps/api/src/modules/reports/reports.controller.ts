import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { ReportService } from "../../services/reportService.js";

const reportService = new ReportService();

const dailyReportQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  week: z.string().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  team: z.string().trim().max(80).optional(),
  sales_rep: z.string().uuid().optional(),
  product_type: z.string().trim().max(120).optional(),
  timezone: z.string().trim().max(80).optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function requireOrganizationId(request: Request, organizationId?: string) {
  const resolvedOrganizationId = request.auth?.organizationId ?? organizationId ?? "";

  if (!resolvedOrganizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return resolvedOrganizationId;
}

export async function getDailyReport(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = dailyReportQuerySchema.parse(request.query);
  const organizationId = requireOrganizationId(request, input.organization_id);

  const report = await reportService.getDailyReport(auth, {
    organizationId,
    year: input.year,
    month: input.month,
    week: input.week ?? null,
    specificDay: input.day ?? null,
    team: input.team ?? null,
    salesRepId: input.sales_rep ?? null,
    productType: input.product_type ?? null,
    timezone: input.timezone ?? null
  });

  return response.json({ data: report });
}
