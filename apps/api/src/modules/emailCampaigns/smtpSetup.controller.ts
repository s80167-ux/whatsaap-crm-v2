import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { SmtpSetupAssistantService } from "../../services/smtpSetupAssistantService.js";

const smtpSetupAssistantService = new SmtpSetupAssistantService();

const detectBodySchema = z.object({
  email: z.string().trim().email().max(254)
});

const testConfigBodySchema = z.object({
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.coerce.number().int().positive().max(65535),
  security: z.enum(["STARTTLS", "SSL", "NONE"]),
  smtpUsername: z.string().trim().min(1).max(255),
  smtpPassword: z.string().min(1).max(500),
  fromEmail: z.string().trim().email().max(254),
  fromName: z.string().trim().min(1).max(160),
  replyTo: z.string().trim().email().max(254).optional().nullable(),
  toEmail: z.string().trim().email().max(254),
  sendEmail: z.boolean().optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function detectSmtpSettings(request: Request, response: Response) {
  requireAuth(request);
  const body = detectBodySchema.parse(request.body);
  const data = await smtpSetupAssistantService.detect(body.email);
  return response.json({ data });
}

export async function testSmtpConfig(request: Request, response: Response) {
  requireAuth(request);
  const body = testConfigBodySchema.parse(request.body);
  const data = await smtpSetupAssistantService.testConfig({
    smtpHost: body.smtpHost,
    smtpPort: body.smtpPort,
    security: body.security,
    smtpUsername: body.smtpUsername,
    smtpPassword: body.smtpPassword,
    fromEmail: body.fromEmail,
    fromName: body.fromName,
    replyTo: body.replyTo ?? null,
    toEmail: body.toEmail,
    sendEmail: body.sendEmail
  });
  return response.json({ data });
}
