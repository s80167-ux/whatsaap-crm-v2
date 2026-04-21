import type { Request, Response } from "express";
import { z } from "zod";
import { QueryService } from "../services/queryService.js";

const queryService = new QueryService();

export async function getInboxThreads(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = req.auth?.organizationId ?? String(req.query.organization_id || "");

  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const conversations = await queryService.listConversations(req.auth, organizationId);
  return res.json({ data: conversations });
}

export async function getInboxThreadMessages(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = req.auth?.organizationId ?? String(req.query.organization_id || "");

  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const { conversationId } = z
    .object({
      conversationId: z.string().uuid()
    })
    .parse(req.params);

  const messages = await queryService.listMessages(req.auth, organizationId, conversationId);
  return res.json({ data: messages });
}
