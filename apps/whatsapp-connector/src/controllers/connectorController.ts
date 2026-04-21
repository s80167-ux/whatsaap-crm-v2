import type { Request, Response } from "express";
import { z } from "zod";
import { ConnectorCommandService } from "../services/connectorCommandService.js";

const connectorCommandService = new ConnectorCommandService();

const accountParamSchema = z.object({
  accountId: z.string().uuid()
});

const sendMessageSchema = z.object({
  accountId: z.string().uuid(),
  recipientJid: z.string().min(3),
  text: z.string().min(1)
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
