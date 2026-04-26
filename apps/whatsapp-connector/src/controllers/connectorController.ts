import type { Request, Response } from "express";
import { z } from "zod";
import { ConnectorCommandService } from "../services/connectorCommandService.js";

const connectorCommandService = new ConnectorCommandService();

const accountParamSchema = z.object({
  accountId: z.string().uuid()
});

const attachmentSchema = z.object({
  kind: z.enum(["image", "video", "audio", "document"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  dataBase64: z.string().min(1)
});

const sendMessageSchema = z.object({
  accountId: z.string().uuid(),
  recipientJid: z.string().min(3),
  text: z.string().trim().max(4000).optional(),
  attachment: attachmentSchema.optional().nullable()
}).refine((input) => Boolean(input.text?.trim()) || Boolean(input.attachment), {
  message: "Message text or one attachment is required",
  path: ["text"]
});

export async function health(_req: Request, res: Response) {
  return res.json({ ok: true });
}

export async function initializeAllSessions(_req: Request, res: Response) {
  await connectorCommandService.initializeAll();
  return res.status(202).json({ ok: true });
}

export async function initializeAccountSession(req: Request, res: Response) {
  const { accountId } = accountParamSchema.parse(req.params);
  const account = await connectorCommandService.initializeAccount(accountId);
  return res.status(202).json({ data: account });
}

export async function reconnectAccountSession(req: Request, res: Response) {
  const { accountId } = accountParamSchema.parse(req.params);
  const account = await connectorCommandService.reconnectAccount(accountId);
  return res.status(202).json({ data: account });
}

export async function backfillAccountSession(req: Request, res: Response) {
  const { accountId } = accountParamSchema.parse(req.params);
  const result = await connectorCommandService.backfillAccount(accountId);
  return res.status(202).json({ data: result });
}

export async function terminateAccountSession(req: Request, res: Response) {
  const { accountId } = accountParamSchema.parse(req.params);
  const result = await connectorCommandService.terminateAccount(accountId);
  return res.json({ data: result });
}

export async function sendAccountMessage(req: Request, res: Response) {
  const input = sendMessageSchema.parse(req.body);
  const payload = await connectorCommandService.sendMessage(input);
  return res.status(201).json({ data: payload });
}
