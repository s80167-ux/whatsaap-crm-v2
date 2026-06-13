import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { AdminService } from "../../services/adminService.js";

const adminService = new AdminService();
const auditLogService = new AuditLogService();

const createOrganizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional().nullable()
});

const createUserSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  email: z.string().email(),
  fullName: z.string().min(1).optional().nullable(),
  password: z.string().min(8),
  role: z.enum(["super_admin", "org_admin", "manager", "agent", "user"])
});

const createWhatsAppAccountSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  phoneNumber: z.string().min(6).optional().nullable(),
  historySyncLookbackDays: z.coerce.number().int().min(0).max(365).default(7)
});

const updateWhatsAppAccountSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  phoneNumber: z.string().min(6).optional().nullable(),
  historySyncLookbackDays: z.coerce.number().int().min(0).max(365).optional().nullable()
});

const rawEventStatusSchema = z.enum(["pending", "processing", "processed", "failed", "ignored"]);

const replayRawEventsSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  whatsappAccountId: z.string().uuid().optional().nullable(),
  eventIds: z.array(z.string().uuid()).optional(),
  statuses: z.array(rawEventStatusSchema).optional(),
  limit: z.number().int().positive().max(500).optional(),
  processNow: z.boolean().optional()
});

const listWhatsAppAccountsQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const whatsappAccountAccessRoleSchema = z.enum(["owner", "manager", "agent", "viewer"]);

const updateWhatsAppAccountAccessSchema = z.object({
  accessList: z.array(z.object({
    organizationUserId: z.string().uuid(),
    accessRole: whatsappAccountAccessRoleSchema,
    canView: z.boolean(),
    canReply: z.boolean(),
    canCreateSales: z.boolean(),
    canEditSales: z.boolean(),
    isActive: z.boolean()
  })).min(1)
});

const listRawEventsQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  whatsapp_account_id: z.string().uuid().optional(),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

const campaignsModuleStatusQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const moduleStatusParamsSchema = z.object({
  moduleKey: z.enum(["campaigns", "campaign", "campaign.whatsapp", "campaign.email", "ai_message_assist", "inbox", "crm", "sales"])
});

const updateOrganizationAccessLimitsSchema = z.object({
  campaignsEnabled: z.boolean().optional(),
  campaignEnabled: z.boolean().optional(),
  campaignWhatsAppEnabled: z.boolean().optional(),
  campaignEmailEnabled: z.boolean().optional(),
  aiMessageAssistEnabled: z.boolean().optional(),
  inboxEnabled: z.boolean().optional(),
  crmEnabled: z.boolean().optional(),
  salesEnabled: z.boolean().optional(),
  maxWhatsappAccounts: z.coerce.number().int().min(0).max(20).optional(),
  historySyncDays: z.coerce.number().int().min(0).max(365).optional(),
  maxUsers: z.coerce.number().int().min(1).max(500).nullable().optional(),
  aiDailyCredits: z.coerce.number().int().min(0).max(100000).optional(),
  aiMonthlyCredits: z.coerce.number().int().min(0).max(1000000).optional(),
  campaignMonthlyCount: z.coerce.number().int().min(0).max(100000).optional(),
  campaignRecipientsPerCampaign: z.coerce.number().int().min(0).max(1000000).optional(),
  campaignTemplatesCount: z.coerce.number().int().min(0).max(10000).optional(),
  campaignAudienceSegments: z.coerce.number().int().min(0).max(10000).optional(),
  campaignScheduledCount: z.coerce.number().int().min(0).max(10000).optional(),
  campaignWhatsAppMessagesPerDay: z.coerce.number().int().min(0).max(1000000).optional(),
  campaignWhatsAppMessagesPerMonth: z.coerce.number().int().min(0).max(10000000).optional(),
  campaignWhatsAppRecipientsPerBroadcast: z.coerce.number().int().min(0).max(1000000).optional(),
  campaignWhatsAppDelaySecondsMin: z.coerce.number().int().min(0).max(3600).optional(),
  campaignWhatsAppDelaySecondsMax: z.coerce.number().int().min(0).max(3600).optional(),
  campaignWhatsAppMaxConnectors: z.coerce.number().int().min(0).max(100).optional(),
  campaignWhatsAppRequireApproval: z.boolean().optional(),
  campaignEmailEmailsPerDay: z.coerce.number().int().min(0).max(1000000).optional(),
  campaignEmailEmailsPerMonth: z.coerce.number().int().min(0).max(10000000).optional(),
  campaignEmailRecipientsPerBlast: z.coerce.number().int().min(0).max(1000000).optional(),
  campaignEmailVerifiedDomains: z.coerce.number().int().min(0).max(1000).optional(),
  campaignEmailRequireUnsubscribe: z.boolean().optional()
});

const listGoogleSignupRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).optional()
});

const approveGoogleSignupRequestSchema = z.object({
  organizationId: z.string().uuid(),
  role: z.enum(["org_admin", "manager", "agent", "user"]),
  fullName: z.string().min(1).optional().nullable()
});

const rejectGoogleSignupRequestSchema = z.object({
  reason: z.string().min(1).max(500).optional().nullable()
});
const reconnectWhatsAppAccountSchema = z.object({
  confirmBlockedReconnect: z.boolean().optional()
});

const warmerStatusSchema = z.enum(["not_started", "active", "paused", "completed"]);
const warmerContactSourceSchema = z.enum(["known_contacts"]);
const warmerMessageSourceSchema = z.enum(["warmup_templates"]);

const saveWhatsAppNumberWarmerSchema = z.object({
  warmupDays: z.coerce.number().int().min(1).max(365).optional(),
  currentDay: z.coerce.number().int().min(1).max(365).optional(),
  dailyTarget: z.coerce.number().int().min(1).max(500).optional(),
  minDelayMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  maxDelayMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  activeFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeUntil: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weekendEnabled: z.boolean().optional(),
  contactSource: warmerContactSourceSchema.optional(),
  messageSource: warmerMessageSourceSchema.optional(),
  manualRecipientNumbers: z.array(z.string().min(3)).optional(),
  status: warmerStatusSchema.optional()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function mapWhatsAppAccount(account: {
  id: string;
  organization_id: string;
  created_by?: string | null;
  label: string | null;
  account_phone_e164: string | null;
  account_phone_normalized: string | null;
  connection_status: string;
  last_connected_at?: string | null;
  last_disconnected_at?: string | null;
  health_score?: number | null;
  history_sync_lookback_days?: number | null;
  warmer_status?: string | null;
  warmer_warmup_days?: number | null;
  warmer_current_day?: number | null;
  warmer_daily_target?: number | null;
  warmer_today_warmed?: number | null;
  warmer_last_warmed_at?: string | null;
  warmer_next_warm_at?: string | null;
}) {
  return {
    id: account.id,
    organization_id: account.organization_id,
    created_by: account.created_by ?? null,
    name: account.label,
    phone_number: account.account_phone_e164,
    phone_number_normalized: account.account_phone_normalized,
    status: account.connection_status,
    last_connected_at: account.last_connected_at ?? null,
    last_disconnected_at: account.last_disconnected_at ?? null,
    health_score: account.health_score ?? null,
    history_sync_lookback_days: account.history_sync_lookback_days ?? 7,
    warmer_status: account.warmer_status ?? null,
    warmer_warmup_days: account.warmer_warmup_days ?? null,
    warmer_current_day: account.warmer_current_day ?? null,
    warmer_daily_target: account.warmer_daily_target ?? null,
    warmer_today_warmed: account.warmer_today_warmed ?? null,
    warmer_last_warmed_at: account.warmer_last_warmed_at ?? null,
    warmer_next_warm_at: account.warmer_next_warm_at ?? null
  };
}

function mapWhatsAppNumberWarmerProfile(profile: {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  warmup_days: number;
  current_day: number;
  daily_target: number;
  today_warmed: number;
  min_delay_minutes: number;
  max_delay_minutes: number;
  active_from: string;
  active_until: string;
  weekend_enabled: boolean;
  contact_source: string;
  message_source: string;
  manual_recipient_numbers?: string[] | null;
  auto_recipient_numbers?: string[] | null;
  status: string;
  started_at?: string | null;
  paused_at?: string | null;
  completed_at?: string | null;
  last_warmed_at?: string | null;
  next_warm_at?: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: profile.id,
    organization_id: profile.organization_id,
    whatsapp_account_id: profile.whatsapp_account_id,
    warmup_days: profile.warmup_days,
    current_day: profile.current_day,
    daily_target: profile.daily_target,
    today_warmed: profile.today_warmed,
    min_delay_minutes: profile.min_delay_minutes,
    max_delay_minutes: profile.max_delay_minutes,
    active_from: profile.active_from,
    active_until: profile.active_until,
    weekend_enabled: profile.weekend_enabled,
    contact_source: profile.contact_source,
    message_source: profile.message_source,
    manual_recipient_numbers: profile.manual_recipient_numbers ?? [],
    auto_recipient_numbers: profile.auto_recipient_numbers ?? [],
    status: profile.status,
    started_at: profile.started_at ?? null,
    paused_at: profile.paused_at ?? null,
    completed_at: profile.completed_at ?? null,
    last_warmed_at: profile.last_warmed_at ?? null,
    next_warm_at: profile.next_warm_at ?? null,
    created_at: profile.created_at,
    updated_at: profile.updated_at
  };
}

function mapWhatsAppNumberWarmerLog(log: {
  id: string;
  level: string;
  event_type: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}) {
  return {
    id: log.id,
    level: log.level,
    event_type: log.event_type,
    message: log.message,
    metadata: log.metadata ?? {},
    created_at: log.created_at
  };
}

function mapWhatsAppAccessAccount(account: {
  id: string;
  organization_id: string;
  created_by?: string | null;
  label: string | null;
  account_phone_e164: string | null;
  account_phone_normalized: string | null;
  connection_status: string;
  display_name?: string | null;
  owner_name?: string | null;
  access_count?: number | null;
}) {
  return {
    id: account.id,
    organization_id: account.organization_id,
    created_by: account.created_by ?? null,
    name: account.label ?? account.display_name ?? "Untitled account",
    phone_number: account.account_phone_e164,
    phone_number_normalized: account.account_phone_normalized,
    status: account.connection_status,
    display_name: account.display_name ?? null,
    owner_name: account.owner_name ?? null,
    access_count: account.access_count ?? 0
  };
}

function mapWhatsAppAccountAccess(access: {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  organization_user_id: string;
  access_role: string;
  can_view: boolean;
  can_reply: boolean;
  can_create_sales: boolean;
  can_edit_sales: boolean;
  is_active: boolean;
  user_email?: string | null;
  user_full_name?: string | null;
  user_role?: string | null;
  user_status?: string | null;
}) {
  return {
    id: access.id,
    organization_id: access.organization_id,
    whatsapp_account_id: access.whatsapp_account_id,
    organization_user_id: access.organization_user_id,
    access_role: access.access_role,
    can_view: access.can_view,
    can_reply: access.can_reply,
    can_create_sales: access.can_create_sales,
    can_edit_sales: access.can_edit_sales,
    is_active: access.is_active,
    user: {
      email: access.user_email ?? null,
      full_name: access.user_full_name ?? null,
      role: access.user_role ?? null,
      status: access.user_status ?? null
    }
  };
}

export async function listOrganizations(_request: Request, response: Response) {
  const organizations = await adminService.listOrganizations();
  return response.json({ data: organizations });
}

export async function createOrganization(request: Request, response: Response) {
  const input = createOrganizationSchema.parse(request.body);
  const organization = await adminService.createOrganization(input);

  await auditLogService.record(request.auth ?? null, {
    organizationId: organization.id,
    action: "organization.created",
    entityType: "organization",
    entityId: organization.id,
    metadata: {
      name: organization.name,
      slug: organization.slug
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: organization });
}

export async function deleteOrganization(request: Request, response: Response) {
  const organizationId = z.string().uuid().parse(request.params.organizationId);
  await adminService.deleteOrganization(organizationId);

  await auditLogService.record(request.auth ?? null, {
    organizationId,
    action: "organization.deleted",
    entityType: "organization",
    entityId: organizationId,
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function getCampaignsModuleStatus(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = campaignsModuleStatusQuerySchema.parse(request.query);
  const params = moduleStatusParamsSchema.safeParse(request.params);
  const moduleKey = params.success ? params.data.moduleKey : "campaign";
  const status = await adminService.getOrganizationModuleStatus(auth, moduleKey, organizationId ?? null);

  return response.json({
    data: status
  });
}

export async function getOrganizationAccessLimits(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = z.string().uuid().parse(request.params.organizationId);
  const accessLimits = await adminService.getOrganizationAccessLimits(auth, organizationId);

  return response.json({ data: accessLimits });
}

export async function updateOrganizationAccessLimits(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = z.string().uuid().parse(request.params.organizationId);
  const input = updateOrganizationAccessLimitsSchema.parse(request.body);
  const accessLimits = await adminService.updateOrganizationAccessLimits(auth, organizationId, input);

  await auditLogService.record(auth, {
    organizationId,
    action: "organization_access_limits.updated",
    entityType: "organization_access_limits",
    entityId: organizationId,
    metadata: {
      changed_values: input
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: accessLimits });
}

export async function listOrganizationUsers(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = typeof request.query.organization_id === "string" ? request.query.organization_id : undefined;
  const users = await adminService.listUsers(auth, organizationId);
  return response.json({ data: users });
}

export async function createOrganizationUser(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createUserSchema.parse(request.body);
  const user = await adminService.createUser(auth, {
    ...input,
    fullName: input.fullName ?? null
  });

  await auditLogService.record(auth, {
    organizationId: user.organization_id,
    action: "organization_user.created",
    entityType: "organization_user",
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({
    data: {
      id: user.id,
      organizationId: user.organization_id,
      authUserId: user.auth_user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      status: user.status
    }
  });
}

export async function listGoogleSignupRequests(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { status } = listGoogleSignupRequestsQuerySchema.parse(request.query);
  const requests = await adminService.listGoogleSignupRequests(auth, status ?? "pending");
  return response.json({ data: requests });
}

export async function approveGoogleSignupRequest(request: Request, response: Response) {
  const auth = requireAuth(request);
  const requestId = z.string().uuid().parse(request.params.requestId);
  const input = approveGoogleSignupRequestSchema.parse(request.body);
  const result = await adminService.approveGoogleSignupRequest(auth, requestId, {
    organizationId: input.organizationId,
    role: input.role,
    fullName: input.fullName ?? null
  });

  await auditLogService.record(auth, {
    organizationId: result.user.organization_id,
    action: "google_signup_request.approved",
    entityType: "google_signup_request",
    entityId: result.request.id,
    metadata: {
      email: result.request.email,
      organization_user_id: result.user.id,
      role: result.user.role
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: result });
}

export async function rejectGoogleSignupRequest(request: Request, response: Response) {
  const auth = requireAuth(request);
  const requestId = z.string().uuid().parse(request.params.requestId);
  const input = rejectGoogleSignupRequestSchema.parse(request.body);
  const signupRequest = await adminService.rejectGoogleSignupRequest(auth, requestId, input.reason ?? null);

  await auditLogService.record(auth, {
    organizationId: null,
    action: "google_signup_request.rejected",
    entityType: "google_signup_request",
    entityId: signupRequest.id,
    metadata: {
      email: signupRequest.email,
      reason: signupRequest.rejection_reason
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: signupRequest });
}

export async function deleteOrganizationUser(request: Request, response: Response) {
  const auth = requireAuth(request);
  const userId = z.string().uuid().parse(request.params.userId);
  await adminService.deleteUser(auth, userId);

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "organization_user.deleted",
    entityType: "organization_user",
    entityId: userId,
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function listWhatsAppAccounts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = listWhatsAppAccountsQuerySchema.parse(request.query);
  const accounts = await adminService.listWhatsAppAccounts(auth, organizationId);
  return response.json({ data: accounts.map(mapWhatsAppAccount) });
}

export async function getWhatsAppNumberWarmer(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const warmer = await adminService.getWhatsAppNumberWarmer(auth, accountId);

  return response.json({
    data: {
      account: mapWhatsAppAccount(warmer.account),
      profile: warmer.profile ? mapWhatsAppNumberWarmerProfile(warmer.profile) : null
    }
  });
}

export async function enableWhatsAppNumberWarmer(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const warmer = await adminService.enableWhatsAppNumberWarmer(auth, accountId);

  return response.status(201).json({
    data: {
      account: mapWhatsAppAccount(warmer.account),
      profile: mapWhatsAppNumberWarmerProfile(warmer.profile)
    }
  });
}

export async function saveWhatsAppNumberWarmer(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const input = saveWhatsAppNumberWarmerSchema.parse(request.body ?? {});
  const warmer = await adminService.saveWhatsAppNumberWarmer(auth, accountId, input);

  return response.json({
    data: {
      account: mapWhatsAppAccount(warmer.account),
      profile: mapWhatsAppNumberWarmerProfile(warmer.profile)
    }
  });
}

export async function startWhatsAppNumberWarmer(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const warmer = await adminService.startWhatsAppNumberWarmer(auth, accountId);

  return response.json({
    data: {
      account: mapWhatsAppAccount(warmer.account),
      profile: mapWhatsAppNumberWarmerProfile(warmer.profile)
    }
  });
}

export async function pauseWhatsAppNumberWarmer(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const warmer = await adminService.pauseWhatsAppNumberWarmer(auth, accountId);

  return response.json({
    data: {
      account: mapWhatsAppAccount(warmer.account),
      profile: mapWhatsAppNumberWarmerProfile(warmer.profile)
    }
  });
}

export async function resumeWhatsAppNumberWarmer(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const warmer = await adminService.resumeWhatsAppNumberWarmer(auth, accountId);

  return response.json({
    data: {
      account: mapWhatsAppAccount(warmer.account),
      profile: mapWhatsAppNumberWarmerProfile(warmer.profile)
    }
  });
}

export async function listWhatsAppNumberWarmerLogs(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const logs = await adminService.listWhatsAppNumberWarmerLogs(auth, accountId);

  return response.json({
    data: logs.map(mapWhatsAppNumberWarmerLog)
  });
}

export async function listWhatsAppAccountAccess(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = listWhatsAppAccountsQuerySchema.parse(request.query);
  const result = await adminService.listWhatsAppAccountAccess(auth, organizationId ?? null);

  return response.json({
    data: {
      organization_id: result.organizationId,
      accounts: result.accounts.map(mapWhatsAppAccessAccount),
      users: result.users
    }
  });
}

export async function getWhatsAppAccountAccess(request: Request, response: Response) {
  const auth = requireAuth(request);
  const whatsappAccountId = z.string().uuid().parse(request.params.whatsappAccountId);
  const result = await adminService.getWhatsAppAccountAccess(auth, whatsappAccountId);

  return response.json({
    data: {
      account: mapWhatsAppAccessAccount(result.account),
      accessList: result.accessList.map(mapWhatsAppAccountAccess),
      users: result.users
    }
  });
}

export async function updateWhatsAppAccountAccess(request: Request, response: Response) {
  const auth = requireAuth(request);
  const whatsappAccountId = z.string().uuid().parse(request.params.whatsappAccountId);
  const input = updateWhatsAppAccountAccessSchema.parse(request.body);
  const result = await adminService.updateWhatsAppAccountAccess(
    auth,
    whatsappAccountId,
    input.accessList
  );

  await auditLogService.record(auth, {
    organizationId: result.account.organization_id,
    action: "whatsapp_account_access.updated",
    entityType: "whatsapp_account",
    entityId: whatsappAccountId,
    metadata: {
      access_count: result.accessList.length
    },
    request: getRequestAuditContext(request)
  });

  return response.json({
    data: {
      account: mapWhatsAppAccessAccount(result.account),
      accessList: result.accessList.map(mapWhatsAppAccountAccess)
    }
  });
}

export async function createWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createWhatsAppAccountSchema.parse(request.body);
  const account = await adminService.createWhatsAppAccount(auth, {
    ...input,
    phoneNumber: input.phoneNumber ?? null,
    historySyncLookbackDays: input.historySyncLookbackDays
  });

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.created",
    entityType: "whatsapp_account",
    entityId: account.id,
    metadata: {
      label: account.label
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: mapWhatsAppAccount(account) });
}

export async function updateWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const input = updateWhatsAppAccountSchema.parse(request.body);
  const account = await adminService.updateWhatsAppAccount(auth, accountId, {
    ...input,
    phoneNumber: input.phoneNumber ?? null,
    historySyncLookbackDays: input.historySyncLookbackDays
  });

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.updated",
    entityType: "whatsapp_account",
    entityId: account.id,
    metadata: {
      label: account.label,
      phone_number: account.account_phone_e164
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: mapWhatsAppAccount(account) });
}

export async function reconnectWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const input = reconnectWhatsAppAccountSchema.parse(request.body ?? {});
  const account = await adminService.reconnectWhatsAppAccount(auth, accountId, {
    confirmBlockedReconnect: input.confirmBlockedReconnect ?? false
  });

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.reconnected",
    entityType: "whatsapp_account",
    entityId: account.id,
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: mapWhatsAppAccount(account) });
}

export async function resetWhatsAppAccountPairing(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const account = await adminService.resetWhatsAppAccountPairing(auth, accountId);

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.pairing_reset",
    entityType: "whatsapp_account",
    entityId: account.id,
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: mapWhatsAppAccount(account) });
}

export async function disconnectWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const account = await adminService.disconnectWhatsAppAccount(auth, accountId);

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.disconnected",
    entityType: "whatsapp_account",
    entityId: account.id,
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: mapWhatsAppAccount(account) });
}

export async function getWhatsAppAccountQr(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const qrRecord = await adminService.getWhatsAppAccountQr(auth, accountId);

  return response.json({
    qr: qrRecord?.qr ?? null,
    generated_at: qrRecord?.generated_at ?? null
  });
}

export async function deleteWhatsAppAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accountId = z.string().uuid().parse(request.params.accountId);
  const account = await adminService.deleteWhatsAppAccount(auth, accountId);

  await auditLogService.record(auth, {
    organizationId: account.organization_id,
    action: "whatsapp_account.deleted",
    entityType: "whatsapp_account",
    entityId: accountId,
    request: getRequestAuditContext(request)
  });

  return response.json({ ok: true });
}

export async function listRawEvents(request: Request, response: Response) {
  const auth = requireAuth(request);
  const {
    organization_id: organizationId,
    whatsapp_account_id: whatsappAccountId,
    status: statusQuery,
    limit: parsedLimit
  } = listRawEventsQuerySchema.parse(request.query);
  const statuses = Array.isArray(statusQuery)
    ? statusQuery
    : typeof statusQuery === "string"
      ? statusQuery.split(",").map((status) => status.trim()).filter(Boolean)
      : undefined;

  const parsedStatuses = statuses ? z.array(rawEventStatusSchema).parse(statuses) : undefined;

  const events = await adminService.listRawEvents(auth, {
    organizationId,
    whatsappAccountId,
    statuses: parsedStatuses,
    limit: parsedLimit
  });

  return response.json({ data: events });
}

export async function replayRawEvents(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = replayRawEventsSchema.parse(request.body);
  const result = await adminService.replayRawEvents(auth, {
    organizationId: input.organizationId ?? null,
    whatsappAccountId: input.whatsappAccountId ?? null,
    eventIds: input.eventIds,
    statuses: input.statuses,
    limit: input.limit,
    processNow: input.processNow ?? true
  });

  await auditLogService.record(auth, {
    organizationId: input.organizationId ?? auth.organizationId,
    action: "raw_events.replayed",
    entityType: "raw_channel_event_batch",
    entityId: input.whatsappAccountId ?? null,
    metadata: {
      event_ids: input.eventIds ?? [],
      statuses: input.statuses ?? ["failed"],
      limit: input.limit ?? null,
      process_now: input.processNow ?? true,
      replayed: result.replayed,
      processed: result.processed
    },
    request: getRequestAuditContext(request)
  });

  return response.status(202).json({ data: result });
}
