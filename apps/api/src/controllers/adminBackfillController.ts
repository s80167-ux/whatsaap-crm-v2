import type { Request, Response } from "express";
import { z } from "zod";
import { AdminBackfillService } from "../services/adminBackfillService.js";
import { WhatsAppSyncJobService } from "../services/whatsAppSyncJobService.js";

const adminBackfillService = new AdminBackfillService();
const whatsappSyncJobService = new WhatsAppSyncJobService();

const paramsSchema = z.object({
  accountId: z.string().uuid()
});

const jobParamsSchema = z.object({
  jobId: z.string().uuid()
});

const latestJobQuerySchema = z.object({
  accountId: z.string().uuid()
});

const bodySchema = z.object({
  lookbackDays: z.union([
    z.literal(-1),
    z.literal(0),
    z.literal(7),
    z.literal(30),
    z.literal(90),
    z.literal(180),
    z.literal(365)
  ]).default(7),
  jobType: z.enum(["contacts_sync", "history_backfill", "full_sync"]).default("history_backfill")
});

export async function backfillWhatsAppAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { accountId } = paramsSchema.parse(req.params);
  const { lookbackDays, jobType } = bodySchema.parse(req.body);

  const result = await adminBackfillService.backfillWhatsAppAccount(req.auth, accountId, lookbackDays, jobType);

  return res.status(202).json({ data: result });
}

export async function syncWhatsAppContacts(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { accountId } = paramsSchema.parse(req.params);
  const result = await adminBackfillService.backfillWhatsAppAccount(req.auth, accountId, 0, "contacts_sync");

  return res.status(202).json({ data: result });
}

export async function backfillWhatsAppHistory(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { accountId } = paramsSchema.parse(req.params);
  const { lookbackDays } = bodySchema.parse(req.body);
  const result = await adminBackfillService.backfillWhatsAppAccount(req.auth, accountId, lookbackDays, "history_backfill");

  return res.status(202).json({ data: result });
}

export async function fullSyncWhatsAppAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { accountId } = paramsSchema.parse(req.params);
  const { lookbackDays } = bodySchema.parse(req.body);
  const result = await adminBackfillService.backfillWhatsAppAccount(req.auth, accountId, lookbackDays, "full_sync");

  return res.status(202).json({ data: result });
}

export async function getWhatsAppSyncJob(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { jobId } = jobParamsSchema.parse(req.params);
  const job = await whatsappSyncJobService.getJob(req.auth, jobId);

  return res.json({ data: job });
}

export async function getLatestWhatsAppSyncJob(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { accountId } = latestJobQuerySchema.parse(req.query);
  const job = await whatsappSyncJobService.getLatestJobForAccount(req.auth, accountId);

  return res.json({ data: job });
}
