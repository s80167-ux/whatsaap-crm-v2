import type { Request, Response } from "express";
import { DashboardService } from "../services/dashboardService.js";

const dashboardService = new DashboardService();

function resolveRangeDays(value: unknown) {
  const normalized = Number(value);
  return normalized === 7 || normalized === 30 || normalized === 90 ? normalized : 30;
}

export async function getAgentDashboard(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const dashboard = await dashboardService.getAgentDashboard(req.auth, { dateRangeDays: resolveRangeDays(req.query.range_days) });
  return res.json({ data: dashboard });
}

export async function getAdminDashboard(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = typeof req.query.organization_id === "string" ? req.query.organization_id : null;
  const dashboard = await dashboardService.getAdminDashboard(req.auth, organizationId, { dateRangeDays: resolveRangeDays(req.query.range_days) });
  return res.json({ data: dashboard });
}

export async function getSuperAdminDashboard(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const dashboard = await dashboardService.getSuperAdminDashboard({ dateRangeDays: resolveRangeDays(req.query.range_days) });
  return res.json({ data: dashboard });
}
