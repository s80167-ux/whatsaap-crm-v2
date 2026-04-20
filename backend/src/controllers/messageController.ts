import type { Request, Response } from "express";
import { z } from "zod";
import { QueryService } from "../services/queryService.js";
import { SendMessageService } from "../services/sendMessageService.js";

const queryService = new QueryService();
const sendMessageService = new SendMessageService();

const sendSchema = z.object({
  whatsappAccountId: z.string().uuid(),
  conversationId: z.string().uuid(),
  text: z.string().min(1)
});

export async function getMessages(req: Request, res: Response) {
  const organizationId = req.auth?.organizationId ?? String(req.query.organization_id || "");
  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const { conversation_id } = z
    .object({
      conversation_id: z.string().uuid()
    })
    .parse(req.params);

  const messages = await queryService.listMessages(organizationId, conversation_id);
  return res.json({ data: messages });
}

export async function sendWhatsAppMessage(req: Request, res: Response) {
  const input = sendSchema.parse(req.body);

  if (!req.auth?.organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const message = await sendMessageService.send({
    ...input,
    organizationId: req.auth.organizationId
  });
  return res.status(201).json({ data: message });
}
