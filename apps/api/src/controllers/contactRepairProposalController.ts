import { Request, Response } from "express";
import { ContactRepairProposalService } from "../services/contactRepairProposalService.js";
import { AppError } from "../lib/errors.js";

function getRouteParam(value: string | string[] | undefined, name: string) {
  if (Array.isArray(value)) return value[0];
  if (!value) throw new AppError(`${name} is required`, 400, "missing_route_param");
  return value;
}

function getAuth(req: Request) {
  return (req as any).auth ?? (req as any).user;
}

function getBodyString(req: Request, camelKey: string, snakeKey: string) {
  const body = req.body as Record<string, unknown> | undefined;
  const camel = body?.[camelKey];
  const snake = body?.[snakeKey];

  if (typeof camel === "string" && camel.trim()) return camel.trim();
  if (typeof snake === "string" && snake.trim()) return snake.trim();

  return null;
}

function getQueryString(req: Request, key: string) {
  const value = req.query[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function withOrganizationContext(req: Request) {
  const auth = getAuth(req);

  if (!auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  const requestedOrganizationId =
    getBodyString(req, "organizationId", "organization_id") ??
    getQueryString(req, "organization_id") ??
    auth.organizationId ??
    null;

  if (!requestedOrganizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  if (auth.role !== "super_admin" && auth.organizationId && auth.organizationId !== requestedOrganizationId) {
    throw new AppError("Organization access denied", 403, "organization_forbidden");
  }

  return {
    ...auth,
    organizationId: requestedOrganizationId
  };
}

export async function detectContactRepairProposal(req: Request, res: Response) {
  const contactId = getRouteParam(req.params.contactId, "contactId");
  const result = await ContactRepairProposalService.detectForContact(contactId, {
    user: withOrganizationContext(req)
  });
  return res.json({ data: result });
}

export async function listContactRepairProposals(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const result = await ContactRepairProposalService.list({
    user: withOrganizationContext(req),
    status
  });
  return res.json({ data: result });
}

export async function approveContactRepairProposal(req: Request, res: Response) {
  const proposalId = getRouteParam(req.params.proposalId, "proposalId");
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  const result = await ContactRepairProposalService.approveAndApply(proposalId, {
    user: withOrganizationContext(req),
    note
  });
  return res.json({ data: result });
}

export async function rejectContactRepairProposal(req: Request, res: Response) {
  const proposalId = getRouteParam(req.params.proposalId, "proposalId");
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  const result = await ContactRepairProposalService.reject(proposalId, {
    user: withOrganizationContext(req),
    note
  });
  return res.json({ data: result });
}
