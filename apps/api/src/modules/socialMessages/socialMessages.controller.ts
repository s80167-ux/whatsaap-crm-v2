import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { SocialMessageSendService } from "../../services/socialMessageSendService.js";

const socialMessageSendService = new SocialMessageSendService();

const sendSocialMessageSchema = z.object({
  conversationId: z.string().uuid(),
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  text: z.string().trim().min(1).max(4000)
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function sendSocialMessage(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = sendSocialMessageSchema.parse(request.body);
  const organizationId = auth.organizationId ?? input.organizationId ?? input.organization_id ?? null;

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const message = await socialMessageSendService.send({
    organizationId,
    conversationId: input.conversationId,
    text: input.text
  });

  return response.status(201).json({ data: message });
}
