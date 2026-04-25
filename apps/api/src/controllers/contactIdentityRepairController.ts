import { Request, Response } from "express";
import { ContactIdentityRepairService } from "../services/contactIdentityRepairService";

// POST /admin/contacts/:contactId/refresh
export async function refreshContactIdentity(req: Request, res: Response) {
  const { contactId } = req.params;
  const { dry_run = true, confirm = false } = req.body;
  // TODO: Add org admin permission check
  try {
    const result = await ContactIdentityRepairService.refreshContactIdentity(contactId, { dry_run, confirm, user: req.user });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /admin/contacts/:contactId/corrections/apply
export async function applyCanonicalOverride(req: Request, res: Response) {
  const { contactId } = req.params;
  const { override, dry_run = true, confirm = false } = req.body;
  // TODO: Add org admin permission check
  try {
    const result = await ContactIdentityRepairService.applyCanonicalOverride(contactId, override, { dry_run, confirm, user: req.user });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
