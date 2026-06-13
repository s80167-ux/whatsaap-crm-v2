import type { Request, Response } from "express";
import { z } from "zod";
import { query } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";
import { CampaignRiskGuardService } from "../../services/campaignRiskGuardService.js";
import { CampaignSafetyService } from "../../services/campaignSafetyService.js";

const campaignSafetyService = new CampaignSafetyService();
const campaignRiskGuardService = new CampaignRiskGuardService();

const campaignParamsSchema = z.object({
  campaignId: z.string().uuid()
});

const optOutParamsSchema = z.object({
  id: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  status: z.enum(["allowed", "opted_out", "blocked"]).optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const contentCheckBodySchema = z.object({
  message: z.string().max(5000),
  variables: z.array(z.string()).optional(),
  channel: z.enum(["whatsapp"]).default("whatsapp")
});

const settingsBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  whatsapp_daily_limit: z.number().int().min(1).max(100000).optional(),
  per_account_daily_limit: z.number().int().min(1).max(100000).optional(),
  send_rate_per_minute: z.number().int().min(1).max(1000).optional(),
  min_delay_seconds: z.number().int().min(1).max(3600).optional(),
  max_delay_seconds: z.number().int().min(1).max(3600).optional(),
  auto_pause_enabled: z.boolean().optional(),
  auto_pause_failure_rate: z.number().min(0).max(1).optional(),
  auto_pause_min_sent: z.number().int().min(1).max(100000).optional(),
  recent_contact_cooldown_hours: z.number().int().min(0).max(8760).optional(),
  require_opt_out_text: z.boolean().optional(),
  block_high_spam_risk: z.boolean().optional()
});

const optOutBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  phoneNumber: z.string().trim().min(3),
  normalized_phone: z.string().trim().optional(),
  status: z.enum(["allowed", "opted_out", "blocked"]),
  reason: z.string().trim().max(500).optional().nullable(),
  source: z.string().trim().max(80).optional().nullable()
});

const overrideBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  warning_codes: z.array(z.string().trim().min(1)).default([]),
  note: z.string().trim().max(1000).optional().nullable()
});

const riskGuardApplyBodySchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  review_id: z.string().uuid(),
  apply_tempo: z.boolean().optional().default(false),
  apply_message_override: z.boolean().optional().default(false),
  mark_decision: z.enum(["applied_suggestions", "partially_applied", "ignored_warning", "saved_as_draft"]).optional().default("applied_suggestions")
});

function requireAuth(request: Request) {
  if (!request.auth) throw new AppError("Authentication required", 401, "auth_required");
  return request.auth;
}

function organizationId(input: { organizationId?: string | null; organization_id?: string | null }) {
  return input.organizationId ?? input.organization_id ?? null;
}

function resolveOrganizationScope(
  request: Request,
  input?: { organizationId?: string | null; organization_id?: string | null }
) {
  const auth = requireAuth(request);
  const scopedId = organizationId(input ?? {});

  if (auth.role === "super_admin") {
    const fallback = scopedId ?? auth.organizationId ?? null;
    if (!fallback) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }
    return fallback;
  }

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return auth.organizationId;
}

async function ensureWhatsAppAccountsStatusCompat() {
  await query("alter table if exists whatsapp_accounts add column if not exists status text");
}

export async function getCampaignPrecheck(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const queryInput = organizationQuerySchema.parse(request.query);
  await ensureWhatsAppAccountsStatusCompat();
  const precheck = await campaignSafetyService.runCampaignPrecheck(auth, { organizationId: queryInput.organization_id, campaignId });
  return response.json({ data: precheck });
}

export async function validateCampaignRecipients(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = settingsBodySchema.pick({ organizationId: true, organization_id: true }).parse(request.body);
  const summary = await campaignSafetyService.validateCampaignRecipients(auth, { organizationId: organizationId(input), campaignId });
  return response.json({ data: summary });
}

export async function checkContentRisk(request: Request, response: Response) {
  const input = contentCheckBodySchema.parse(request.body);
  const result = CampaignSafetyService.checkContentRisk(input);
  return response.json({ data: result });
}

export async function getSafetySettings(request: Request, response: Response) {
  const auth = requireAuth(request);
  const queryInput = organizationQuerySchema.parse(request.query);
  const settings = await campaignSafetyService.getSettings(auth, { organizationId: queryInput.organization_id });
  return response.json({ data: settings });
}

export async function updateSafetySettings(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = settingsBodySchema.parse(request.body);
  const settings = await campaignSafetyService.updateSettings(auth, {
    organizationId: organizationId(input),
    whatsapp_daily_limit: input.whatsapp_daily_limit,
    per_account_daily_limit: input.per_account_daily_limit,
    send_rate_per_minute: input.send_rate_per_minute,
    min_delay_seconds: input.min_delay_seconds,
    max_delay_seconds: input.max_delay_seconds,
    auto_pause_enabled: input.auto_pause_enabled,
    auto_pause_failure_rate: input.auto_pause_failure_rate,
    auto_pause_min_sent: input.auto_pause_min_sent,
    recent_contact_cooldown_hours: input.recent_contact_cooldown_hours,
    require_opt_out_text: input.require_opt_out_text,
    block_high_spam_risk: input.block_high_spam_risk
  });
  return response.json({ data: settings });
}

export async function listOptOuts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const queryInput = organizationQuerySchema.parse(request.query);
  const rows = await campaignSafetyService.listOptOuts(auth, {
    organizationId: queryInput.organization_id,
    status: queryInput.status,
    search: queryInput.search,
    limit: queryInput.limit
  });
  return response.json({ data: rows });
}

export async function createOptOut(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = optOutBodySchema.parse(request.body);
  const row = await campaignSafetyService.upsertOptOut(auth, {
    organizationId: organizationId(input),
    contactId: input.contactId ?? input.contact_id ?? null,
    phoneNumber: input.phoneNumber || input.normalized_phone || "",
    status: input.status,
    reason: input.reason,
    source: input.source ?? "manual"
  });
  return response.status(201).json({ data: row });
}

export async function updateOptOut(request: Request, response: Response) {
  const auth = requireAuth(request);
  optOutParamsSchema.parse(request.params);
  const input = optOutBodySchema.parse(request.body);
  const row = await campaignSafetyService.upsertOptOut(auth, {
    organizationId: organizationId(input),
    contactId: input.contactId ?? input.contact_id ?? null,
    phoneNumber: input.phoneNumber || input.normalized_phone || "",
    status: input.status,
    reason: input.reason,
    source: input.source ?? "manual"
  });
  return response.json({ data: row });
}

export async function overrideCampaignWarnings(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = overrideBodySchema.parse(request.body);
  const row = await campaignSafetyService.createWarningOverride(auth, {
    organizationId: organizationId(input),
    campaignId,
    warningCodes: input.warning_codes,
    note: input.note
  });
  return response.status(201).json({ data: row });
}

export async function getCampaignRiskGuardReview(request: Request, response: Response) {
  requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const queryInput = organizationQuerySchema.parse(request.query);
  const review = await campaignRiskGuardService.generateReview({
    organizationId: resolveOrganizationScope(request, { organization_id: queryInput.organization_id }),
    campaignId
  });
  return response.json({ data: review });
}

export async function applyCampaignRiskGuardReview(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { campaignId } = campaignParamsSchema.parse(request.params);
  const input = riskGuardApplyBodySchema.parse(request.body);
  const review = await campaignRiskGuardService.applySuggestedChanges({
    organizationId: resolveOrganizationScope(request, input),
    campaignId,
    reviewId: input.review_id,
    applyTempo: input.apply_tempo,
    applyMessageOverride: input.apply_message_override,
    approvedBy: auth.organizationUserId ?? null,
    decision: input.mark_decision
  });
  return response.json({ data: review });
}
