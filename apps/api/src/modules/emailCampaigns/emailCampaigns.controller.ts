import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { EmailCampaignService } from "../../services/emailCampaignService.js";
import { EmailSenderService } from "../../services/emailSenderService.js";

const senderService = new EmailSenderService();
const campaignService = new EmailCampaignService(senderService);

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  reason: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional()
});

const senderParamsSchema = z.object({ senderId: z.string().uuid() });
const campaignParamsSchema = z.object({ campaignId: z.string().uuid() });
const suppressionParamsSchema = z.object({ id: z.string().uuid() });
const tokenParamsSchema = z.object({ token: z.string().min(8) });

const senderBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  sender_type: z.enum(["smtp", "gmail", "microsoft365"]),
  display_name: z.string().trim().min(1).max(160),
  from_name: z.string().trim().min(1).max(160),
  from_email: z.string().trim().email().max(254),
  reply_to_email: z.string().trim().email().max(254).optional().nullable(),
  smtp_host: z.string().trim().max(255).optional().nullable(),
  smtp_port: z.coerce.number().int().positive().max(65535).optional().nullable(),
  smtp_secure: z.boolean().optional().nullable(),
  smtp_username: z.string().trim().max(255).optional().nullable(),
  smtp_password: z.string().trim().max(500).optional().nullable()
});

const senderUpdateBodySchema = senderBodySchema.partial().extend({
  organizationId: z.string().uuid().optional().nullable()
});

const senderTestBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  to_email: z.string().trim().email().max(254),
  subject: z.string().trim().max(255).optional().nullable(),
  message: z.string().trim().max(5000).optional().nullable()
});

const suppressionBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  email: z.string().trim().email().max(254),
  reason: z.enum(["unsubscribed", "bounced", "complaint", "manual"]),
  note: z.string().trim().max(500).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable()
});

const directRecipientSchema = z.union([
  z.string().trim().email().max(254),
  z.object({
    email: z.string().trim().email().max(254),
    name: z.string().trim().max(160).optional().nullable(),
    contact_id: z.string().uuid().optional().nullable()
  })
]);

const campaignBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  sender_id: z.string().uuid(),
  subject: z.string().trim().min(1).max(255),
  body_html: z.string().min(1),
  body_text: z.string().trim().optional().nullable(),
  audience_group_id: z.string().uuid().optional().nullable(),
  recipients: z.array(directRecipientSchema).optional()
});

const campaignUpdateBodySchema = campaignBodySchema.partial().extend({
  organizationId: z.string().uuid().optional().nullable()
});

const campaignSendTestBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  to_email: z.string().trim().email().max(254),
  subject: z.string().trim().max(255).optional().nullable(),
  message: z.string().trim().max(5000).optional().nullable()
});

const campaignActionBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function mapRecipients(input: z.infer<typeof directRecipientSchema>[] | undefined) {
  return (input ?? []).map((recipient) =>
    typeof recipient === "string"
      ? { email: recipient, name: null, contactId: null }
      : { email: recipient.email, name: recipient.name ?? null, contactId: recipient.contact_id ?? null }
  );
}

export async function listSenders(request: Request, response: Response) {
  const auth = requireAuth(request);
  const queryInput = organizationQuerySchema.parse(request.query);
  const data = await senderService.listSenders(auth, { organizationId: queryInput.organization_id ?? null });
  return response.json({ data });
}

export async function createSender(request: Request, response: Response) {
  const auth = requireAuth(request);
  const body = senderBodySchema.parse(request.body);
  const data = await senderService.createSender(
    auth,
    {
      organizationId: body.organizationId ?? null,
      senderType: body.sender_type,
      displayName: body.display_name,
      fromName: body.from_name,
      fromEmail: body.from_email,
      replyToEmail: body.reply_to_email ?? null,
      smtpHost: body.smtp_host ?? null,
      smtpPort: body.smtp_port ?? null,
      smtpSecure: body.smtp_secure ?? null,
      smtpUsername: body.smtp_username ?? null,
      smtpPassword: body.smtp_password ?? null
    },
    getRequestAuditContext(request)
  );

  return response.status(201).json({ data });
}

export async function updateSender(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { senderId } = senderParamsSchema.parse(request.params);
  const body = senderUpdateBodySchema.parse(request.body);
  const data = await senderService.updateSender(
    auth,
    {
      senderId,
      organizationId: body.organizationId ?? null,
      senderType: body.sender_type,
      displayName: body.display_name,
      fromName: body.from_name,
      fromEmail: body.from_email,
      replyToEmail: body.reply_to_email,
      smtpHost: body.smtp_host,
      smtpPort: body.smtp_port,
      smtpSecure: body.smtp_secure,
      smtpUsername: body.smtp_username,
      smtpPassword: body.smtp_password
    },
    getRequestAuditContext(request)
  );

  return response.json({ data });
}

export async function testSender(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { senderId } = senderParamsSchema.parse(request.params);
  const body = senderTestBodySchema.parse(request.body);
  const data = await senderService.testSender(
    auth,
    {
      senderId,
      organizationId: body.organizationId ?? null,
      toEmail: body.to_email,
      subject: body.subject ?? null,
      message: body.message ?? null
    },
    getRequestAuditContext(request)
  );

  return response.json({ data });
}

export async function disableSender(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { senderId } = senderParamsSchema.parse(request.params);
  const queryInput = organizationQuerySchema.parse(request.query);
  const data = await senderService.disableSender(auth, { senderId, organizationId: queryInput.organization_id ?? null }, getRequestAuditContext(request));
  return response.json({ data });
}

export async function listSuppressionList(request: Request, response: Response) {
  const auth = requireAuth(request);
  const queryInput = organizationQuerySchema.parse(request.query);
  const result = await campaignService.listSuppressionList(auth, {
    organizationId: queryInput.organization_id ?? null,
    search: queryInput.search,
    reason: queryInput.reason,
    limit: queryInput.limit,
    offset: queryInput.offset
  });
  return response.json(result);
}

export async function createSuppression(request: Request, response: Response) {
  const auth = requireAuth(request);
  const body = suppressionBodySchema.parse(request.body);
  const data = await campaignService.addSuppression(
    auth,
    {
      organizationId: body.organizationId ?? null,
      email: body.email,
      reason: body.reason,
      note: body.note ?? null,
      source: body.source ?? null
    },
    getRequestAuditContext(request)
  );
  return response.status(201).json({ data });
}

export async function deleteSuppression(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { id } = suppressionParamsSchema.parse(request.params);
  const queryInput = organizationQuerySchema.parse(request.query);
  const data = await campaignService.removeSuppression(auth, { suppressionId: id, organizationId: queryInput.organization_id ?? null }, getRequestAuditContext(request));
  return response.json({ data });
}

export async function createCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const body = campaignBodySchema.parse(request.body);
  const data = await campaignService.createCampaign(
    auth,
    {
      organizationId: body.organizationId ?? null,
      name: body.name,
      senderId: body.sender_id,
      subject: body.subject,
      bodyHtml: body.body_html,
      bodyText: body.body_text ?? null,
      audienceGroupId: body.audience_group_id ?? null,
      recipients: mapRecipients(body.recipients)
    },
    getRequestAuditContext(request)
  );
  return response.status(201).json({ data });
}

export async function listCampaigns(request: Request, response: Response) {
  const auth = requireAuth(request);
  const queryInput = organizationQuerySchema.parse(request.query);
  const data = await campaignService.listCampaigns(auth, { organizationId: queryInput.organization_id ?? null });
  return response.json({ data });
}

export async function getCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const queryInput = organizationQuerySchema.parse(request.query);
  const data = await campaignService.getCampaign(auth, { organizationId: queryInput.organization_id ?? null, campaignId });
  return response.json({ data });
}

export async function updateCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const body = campaignUpdateBodySchema.parse(request.body);
  const data = await campaignService.updateCampaign(
    auth,
    {
      organizationId: body.organizationId ?? null,
      campaignId,
      name: body.name,
      senderId: body.sender_id,
      subject: body.subject,
      bodyHtml: body.body_html,
      bodyText: body.body_text,
      audienceGroupId: body.audience_group_id,
      recipients: body.recipients ? mapRecipients(body.recipients) : undefined
    },
    getRequestAuditContext(request)
  );
  return response.json({ data });
}

export async function sendCampaignTest(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const body = campaignSendTestBodySchema.parse(request.body);
  const data = await campaignService.sendCampaignTest(
    auth,
    {
      organizationId: body.organizationId ?? null,
      campaignId,
      toEmail: body.to_email,
      subject: body.subject ?? null,
      message: body.message ?? null
    },
    getRequestAuditContext(request)
  );
  return response.json({ data });
}

export async function startCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const body = campaignActionBodySchema.parse(request.body);
  const data = await campaignService.startCampaign(auth, { organizationId: body.organizationId ?? null, campaignId }, getRequestAuditContext(request));
  return response.json({ data });
}

export async function pauseCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const body = campaignActionBodySchema.parse(request.body);
  const data = await campaignService.pauseCampaign(auth, { organizationId: body.organizationId ?? null, campaignId }, getRequestAuditContext(request));
  return response.json({ data });
}

export async function cancelCampaign(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const body = campaignActionBodySchema.parse(request.body);
  const data = await campaignService.cancelCampaign(auth, { organizationId: body.organizationId ?? null, campaignId }, getRequestAuditContext(request));
  return response.json({ data });
}

export async function listCampaignRecipients(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const queryInput = organizationQuerySchema.parse(request.query);
  const result = await campaignService.listRecipients(auth, {
    organizationId: queryInput.organization_id ?? null,
    campaignId,
    status: queryInput.status,
    q: queryInput.q,
    page: queryInput.page,
    limit: queryInput.limit
  });
  return response.json(result);
}

export async function getCampaignReport(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const queryInput = organizationQuerySchema.parse(request.query);
  const data = await campaignService.getReport(auth, { organizationId: queryInput.organization_id ?? null, campaignId });
  return response.json({ data });
}

export async function getCampaignHistory(request: Request, response: Response) {
  const auth = requireAuth(request);
  const queryInput = organizationQuerySchema.parse(request.query);
  const data = await campaignService.listHistory(auth, { organizationId: queryInput.organization_id ?? null, limit: queryInput.limit ?? 50 });
  return response.json({ data });
}

export async function unsubscribeEmailToken(request: Request, response: Response) {
  const { token } = tokenParamsSchema.parse(request.params);
  await campaignService.unsubscribeByToken(token);
  const wantsJson = request.accepts(["html", "json"]) === "json" || request.path.startsWith("/api/");

  if (wantsJson) {
    return response.json({ ok: true, message: "You have been unsubscribed from future email campaigns." });
  }

  return response.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Email Unsubscribe</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}.card{max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:32px;box-shadow:0 20px 45px rgba(15,23,42,.08)}h1{margin:0 0 12px;font-size:28px}p{margin:0;color:#475569;line-height:1.6}</style></head><body><main class="card"><h1>You have been unsubscribed.</h1><p>You have been unsubscribed from future email campaigns.</p></main></body></html>`);
}