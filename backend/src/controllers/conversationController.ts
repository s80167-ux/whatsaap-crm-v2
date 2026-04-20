import type { Request, Response } from "express";
import { QueryService } from "../services/queryService.js";

const queryService = new QueryService();

export async function getConversations(req: Request, res: Response) {
  const organizationId = req.auth?.organizationId ?? String(req.query.organization_id || "");

  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const conversations = await queryService.listConversations(organizationId);
  return res.json({ data: conversations });
}
