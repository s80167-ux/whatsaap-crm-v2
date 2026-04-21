import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { QueryService } from "../../services/queryService.js";

const queryService = new QueryService();

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

function requireOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = request.auth?.organizationId ?? organization_id ?? "";

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return organizationId;
}

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getInboxThreads(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const conversations = await queryService.listConversations(auth, organizationId);
  return response.json({ data: conversations });
}

export async function getInboxThreadMessages(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const { conversationId } = conversationParamsSchema.parse(request.params);
  const messages = await queryService.listMessages(auth, organizationId, conversationId);
  return response.json({ data: messages });
}
