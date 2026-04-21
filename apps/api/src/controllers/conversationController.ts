import type { Request, Response } from "express";
import { z } from "zod";
import { QueryService } from "../services/queryService.js";
import { ConversationService } from "../services/conversationService.js";
import { withTransaction } from "../config/database.js";

const queryService = new QueryService();
const conversationService = new ConversationService();

export async function getConversations(req: Request, res: Response) {
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

export async function assignConversation(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!req.auth.organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const { conversationId } = z
    .object({
      conversationId: z.string().uuid()
    })
    .parse(req.params);

  const { organizationUserId } = z
    .object({
      organizationUserId: z.string().uuid()
    })
    .parse(req.body);

  const assignment = await withTransaction((client) =>
    conversationService.assign(client, {
      organizationId: req.auth!.organizationId!,
      conversationId,
      organizationUserId
    })
  );

  return res.status(201).json({ data: assignment });
}
