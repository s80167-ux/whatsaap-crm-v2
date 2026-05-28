import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { DashboardService } from "../../services/dashboardService.js";

const dashboardService = new DashboardService();
const dashboardQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getAgentDashboard(request: Request, response: Response) {
  const auth = requireAuth(request);
  const dashboard = await dashboardService.getAgentDashboard(auth);
  return response.json({ data: dashboard });
}

export async function getAdminDashboard(request: Request, response: Response) {
  const auth = requireAuth(request);
  const dashboard = await dashboardService.getAdminDashboard(auth);
  return response.json({ data: dashboard });
}

export async function getSuperAdminDashboard(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = dashboardQuerySchema.parse(request.query);
  const dashboard = organizationId
    ? await dashboardService.getAdminDashboard(auth, organizationId)
    : await dashboardService.getSuperAdminDashboard();
  return response.json({ data: dashboard });
}
