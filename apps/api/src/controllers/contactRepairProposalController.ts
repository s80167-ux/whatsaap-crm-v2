import { Request, Response } from "express";
import { ContactRepairProposalService } from "../services/contactRepairProposalService.js";

function getRouteParam(value: string | string[] | undefined, name: string) {
  if (Array.isArray(value)) return value[0];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getAuth(req: Request) {
  return (req as any).auth ?? (req as any).user;
}

export async function detectContactRepairProposal(req: Request, res: Response) {
  try {
    const contactId = getRouteParam(req.params.contactId, "contactId");
    const result = await ContactRepairProposalService.detectForContact(contactId, { user: getAuth(req) });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

export async function listContactRepairProposals(req: Request, res: Response) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const result = await ContactRepairProposalService.list({ user: getAuth(req), status });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

export async function approveContactRepairProposal(req: Request, res: Response) {
  try {
    const proposalId = getRouteParam(req.params.proposalId, "proposalId");
    const note = typeof req.body?.note === "string" ? req.body.note : null;
    const result = await ContactRepairProposalService.approveAndApply(proposalId, { user: getAuth(req), note });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

export async function rejectContactRepairProposal(req: Request, res: Response) {
  try {
    const proposalId = getRouteParam(req.params.proposalId, "proposalId");
    const note = typeof req.body?.note === "string" ? req.body.note : null;
    const result = await ContactRepairProposalService.reject(proposalId, { user: getAuth(req), note });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
