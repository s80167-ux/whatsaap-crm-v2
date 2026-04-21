import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import { DashboardService } from "../../services/dashboardService.js";

const dashboardService = new DashboardService();

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
  requireAuth(request);
  const dashboard = await dashboardService.getSuperAdminDashboard();
  return response.json({ data: dashboard });
}
