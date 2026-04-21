import type { Request, Response } from "express";
import { z } from "zod";
import { PlatformService } from "../services/platformService.js";

const platformService = new PlatformService();

export async function getPlatformOrganizations(_req: Request, res: Response) {
  const organizations = await platformService.listOrganizations();
  return res.json({ data: organizations });
}

export async function getPlatformUsage(_req: Request, res: Response) {
  const usage = await platformService.getUsageSummary();
  return res.json({ data: usage });
}

export async function getPlatformHealth(_req: Request, res: Response) {
  const health = await platformService.getHealthSummary();
  return res.json({ data: health });
}

export async function getPlatformAuditLogs(req: Request, res: Response) {
  const limit = typeof req.query.limit === "string" ? z.coerce.number().int().positive().max(500).parse(req.query.limit) : 100;
  const logs = await platformService.getAuditSummary(limit);
  return res.json({ data: logs });
}
