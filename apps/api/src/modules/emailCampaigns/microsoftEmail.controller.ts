import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { EmailSenderService } from "../../services/emailSenderService.js";
import { MicrosoftEmailService } from "../../services/microsoftEmailService.js";

const microsoftEmailService = new MicrosoftEmailService();
const senderService = new EmailSenderService(undefined, microsoftEmailService);

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  redirect_to: z.string().trim().optional()
});

const callbackQuerySchema = z.object({
  code: z.string().trim().optional(),
  state: z.string().trim().optional(),
  error: z.string().trim().optional(),
  error_description: z.string().trim().optional()
});

const disconnectBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  sender_id: z.string().uuid().optional().nullable()
});

const sendTestBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  provider: z.enum(["microsoft", "custom_smtp", "smtp", "gmail"]).optional(),
  sender_id: z.string().uuid(),
  to_email: z.string().trim().email().max(254),
  subject: z.string().trim().max(255).optional().nullable(),
  message: z.string().trim().max(5000).optional().nullable()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function getMicrosoftAuthUrl(request: Request, response: Response) {
  const auth = requireAuth(request);
  const query = organizationQuerySchema.parse(request.query);
  const data = await microsoftEmailService.getAuthUrl(auth, {
    organizationId: query.organization_id ?? null,
    redirectTo: query.redirect_to ?? null
  });

  return response.json(data);
}

export async function handleMicrosoftCallback(request: Request, response: Response) {
  const auth = requireAuth(request);
  const query = callbackQuerySchema.parse(request.query);
  const redirectUrl = await microsoftEmailService.handleCallback(auth, {
    code: query.code ?? null,
    state: query.state ?? null,
    error: query.error ?? null,
    errorDescription: query.error_description ?? null
  });

  return response.redirect(302, redirectUrl);
}

export async function getMicrosoftStatus(request: Request, response: Response) {
  const auth = requireAuth(request);
  const query = organizationQuerySchema.parse(request.query);
  const data = await microsoftEmailService.getStatus(auth, { organizationId: query.organization_id ?? null });
  return response.json({ data });
}

export async function disconnectMicrosoft(request: Request, response: Response) {
  const auth = requireAuth(request);
  const body = disconnectBodySchema.parse(request.body);
  const data = await microsoftEmailService.disconnect(auth, {
    organizationId: body.organizationId ?? null,
    senderId: body.sender_id ?? null
  });

  return response.json({ data });
}

export async function sendEmailTest(request: Request, response: Response) {
  const auth = requireAuth(request);
  const body = sendTestBodySchema.parse(request.body);
  const data = await senderService.testSender(
    auth,
    {
      senderId: body.sender_id,
      organizationId: body.organizationId ?? null,
      toEmail: body.to_email,
      subject: body.subject ?? null,
      message: body.message ?? null
    },
    getRequestAuditContext(request)
  );

  return response.json({ data });
}
