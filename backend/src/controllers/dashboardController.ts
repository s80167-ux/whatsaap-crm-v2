import type { Request, Response } from "express";
import { DashboardService } from "../services/dashboardService.js";

const dashboardService = new DashboardService();

export async function getAgentDashboard(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const dashboard = await dashboardService.getAgentDashboard(req.auth);
  return res.json({ data: dashboard });
}

export async function getAdminDashboard(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const dashboard = await dashboardService.getAdminDashboard(req.auth);
  return res.json({ data: dashboard });
}

export async function getSuperAdminDashboard(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const dashboard = await dashboardService.getSuperAdminDashboard();
  return res.json({ data: dashboard });
}
