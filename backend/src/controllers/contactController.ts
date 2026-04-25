import { ContactService } from "../services/contactService.js";
const contactService = new ContactService();
export async function mergeContacts(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const organizationId = req.auth.organizationId ?? String(req.body.organization_id || "");
  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }
  const { sourceContactId, targetContactId } = z
    .object({
      sourceContactId: z.string().uuid(),
      targetContactId: z.string().uuid()
    })
    .parse(req.body);
  await withTransaction((client) =>
    contactService.mergeContacts(client, organizationId, sourceContactId, targetContactId)
  );
  return res.status(200).json({ success: true });
}
import type { Request, Response } from "express";
import { z } from "zod";
import { withTransaction } from "../config/database.js";
import { QueryService } from "../services/queryService.js";
import { ContactAssignmentService } from "../services/contactAssignmentService.js";

const queryService = new QueryService();
const contactAssignmentService = new ContactAssignmentService();

export async function getContacts(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = req.auth?.organizationId ?? String(req.query.organization_id || "");

  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const contacts = await queryService.listContacts(req.auth, organizationId);
  return res.json({ data: contacts });
}

export async function getContact(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const organizationId = req.auth?.organizationId ?? String(req.query.organization_id || "");

  if (!organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const { contactId } = z
    .object({
      contactId: z.string().uuid()
    })
    .parse(req.params);

  const contact = await queryService.getContact(req.auth, organizationId, contactId);

  if (!contact) {
    return res.status(404).json({ error: "Contact not found" });
  }

  return res.json({ data: contact });
}

export async function assignContact(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!req.auth.organizationId) {
    return res.status(400).json({ error: "organization_id is required" });
  }

  const { contactId } = z
    .object({
      contactId: z.string().uuid()
    })
    .parse(req.params);

  const { organizationUserId } = z
    .object({
      organizationUserId: z.string().uuid()
    })
    .parse(req.body);

  const contact = await withTransaction((client) =>
    contactAssignmentService.assign(client, {
      organizationId: req.auth!.organizationId!,
      contactId,
      organizationUserId
    })
  );

  return res.status(201).json({ data: contact });
}
