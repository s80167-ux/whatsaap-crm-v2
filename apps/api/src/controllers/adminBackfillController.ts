import type { Request, Response } from "express";
import { z } from "zod";
import { AdminBackfillService } from "../services/adminBackfillService.js";

const adminBackfillService = new AdminBackfillService();

const paramsSchema = z.object({
  accountId: z.string().uuid()
});

const bodySchema = z.object({
  lookbackDays: z.number().int().positive().max(180)
});

export async function backfillWhatsAppAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { accountId } = paramsSchema.parse(req.params);
  const { lookbackDays } = bodySchema.parse(req.body);

  const result = await adminBackfillService.backfillWhatsAppAccount(req.auth, accountId, lookbackDays);

  return res.status(202).json({ data: result });
}
