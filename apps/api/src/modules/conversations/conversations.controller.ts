import type { Request, Response } from "express";
import { z } from "zod";
import { withTransaction } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";
import { ConversationService } from "../../services/conversationService.js";
import { QueryService } from "../../services/queryService.js";

const queryService = new QueryService();
const conversationService = new ConversationService();

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid()
});

const assignConversationBodySchema = z.object({
  organizationUserId: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function requireOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = request.auth?.organizationId ?? organization_id ?? "";

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return organizationId;
}

export async function getConversations(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const conversations = await queryService.listConversations(auth, organizationId);
  return response.json({ data: conversations });
}

export async function assignConversation(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const organizationId = auth.organizationId;

  const { conversationId } = conversationParamsSchema.parse(request.params);
  const { organizationUserId } = assignConversationBodySchema.parse(request.body);

  const assignment = await withTransaction((client) =>
    conversationService.assign(client, {
      organizationId,
      conversationId,
      organizationUserId
    })
  );

  return response.status(201).json({ data: assignment });
}
