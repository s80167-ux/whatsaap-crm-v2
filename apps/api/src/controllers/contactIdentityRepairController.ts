import { Request, Response } from "express";
import { ContactIdentityRepairService } from "../services/contactIdentityRepairService.js";

export async function refreshContactIdentity(req: Request, res: Response) {
  const { contactId } = req.params;
  const { dry_run = true, confirm = false } = req.body;

  try {
    const result = await ContactIdentityRepairService.refreshContactIdentity(contactId, {
      dry_run,
      confirm,
      user: (req as any).user
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

export async function applyCanonicalOverride(req: Request, res: Response) {
  const { contactId } = req.params;
  const { override, dry_run = true, confirm = false } = req.body;

  try {
    const result = await ContactIdentityRepairService.applyCanonicalOverride(contactId, override, {
      dry_run,
      confirm,
      user: (req as any).user
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
