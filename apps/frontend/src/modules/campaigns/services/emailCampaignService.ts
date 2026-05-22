import { apiDelete, apiGet, apiPatch, apiPost } from "../../../lib/http";

export type EmailSenderType = "custom_smtp" | "gmail_app_password";
export type EmailSenderStatus = "draft" | "verified" | "failed" | "disabled" | "expired" | "reconnect_required";
export type SmtpSecurity = "STARTTLS" | "SSL" | "NONE";
export type EmailCampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "paused" | "failed" | "cancelled";
export type EmailRecipientStatus = "pending" | "skipped" | "sending" | "sent" | "failed" | "unsubscribed" | "bounced";
export type EmailSuppressionReason = "unsubscribed" | "bounced" | "complaint" | "manual";

export type EmailSender = {
  id: string;
  organization_id: string;
  sender_type: EmailSenderType;
  display_name: string;
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  status: EmailSenderStatus;
  last_test_status: string | null;
  last_test_error: string | null;
  last_test_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  smtp_username_masked: string | null;
  smtp_password_configured: boolean;
};

export type EmailCampaign = {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  sender_id: string;
  sender_display_name: string | null;
  sender_from_email: string | null;
  audience_group_id: string | null;
  status: EmailCampaignStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  recipients: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  unsubscribed: number;
};

export type EmailCampaignReport = {
  total: number;
  pending: number;
  skipped: number;
  sent: number;
  failed: number;
  unsubscribed: number;
  bounced: number;
  opened: number;
  clicked: number;
  tracking_supported: boolean;
};

export type EmailCampaignRecipient = {
  id: string;
  organization_id: string;
  campaign_id: string;
  contact_id: string | null;
  email: string;
  name: string | null;
  status: EmailRecipientStatus;
  failure_code: string | null;
  failure_reason: string | null;
  provider_message_id: string | null;
  unsubscribe_token_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
};

export type EmailSuppressionEntry = {
  id: string;
  organization_id: string;
  email: string;
  reason: EmailSuppressionReason;
  source: string | null;
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

export type EmailHistoryEntry = {
  id: string;
  organization_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type SaveEmailSenderInput = {
  senderId?: string;
  organizationId?: string | null;
  sender_type: EmailSenderType;
  display_name: string;
  from_name: string;
  from_email: string;
  reply_to_email?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
};

export type SaveEmailCampaignInput = {
  campaignId?: string;
  organizationId?: string | null;
  name: string;
  sender_id: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
  audience_group_id?: string | null;
  recipients?: Array<{ email: string; name?: string | null; contact_id?: string | null }>;
};

export type SmtpConfigSuggestion = {
  smtpHost: string;
  smtpPort: number;
  security: SmtpSecurity;
  smtpUsername: string;
};

export type SmtpDetectionResult = {
  domain: string;
  detectedProvider: string;
  providerLabel: string;
  confidence: number;
  suggestedConfig: SmtpConfigSuggestion | null;
  alternativeConfigs: SmtpConfigSuggestion[];
  notes: string[];
  unsupported: boolean;
};

function withOrgParams(path: string, organizationId?: string | null) {
  if (!organizationId) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}organization_id=${encodeURIComponent(organizationId)}`;
}

export async function fetchEmailSenders(organizationId?: string | null) {
  const response = await apiGet<{ data: EmailSender[] }>(withOrgParams("/email/senders", organizationId));
  return response.data;
}

export async function saveEmailSender(input: SaveEmailSenderInput) {
  if (input.senderId) {
    const response = await apiPatch<{ data: EmailSender }>(`/email/senders/${input.senderId}`, input);
    return response.data;
  }

  const response = await apiPost<{ data: EmailSender }>("/email/senders", input);
  return response.data;
}

export async function testEmailSender(input: { senderId: string; organizationId?: string | null; to_email: string; subject?: string | null; message?: string | null }) {
  const response = await apiPost<{ data: { sender: EmailSender; result: { ok: boolean; message: string } } }>(`/email/senders/${input.senderId}/test`, input);
  return response.data;
}

export async function disableEmailSender(input: { senderId: string; organizationId?: string | null }) {
  const response = await apiDelete<{ data: EmailSender }>(withOrgParams(`/email/senders/${input.senderId}`, input.organizationId));
  return response.data;
}

export async function detectSmtpSettings(input: { email: string }) {
  const response = await apiPost<{ data: SmtpDetectionResult }>("/email/smtp/detect", input);
  return response.data;
}

export async function testSmtpConfig(input: {
  smtpHost: string;
  smtpPort: number;
  security: SmtpSecurity;
  smtpUsername: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  toEmail: string;
  sendEmail?: boolean;
}) {
  const response = await apiPost<{ data: { ok: boolean; message: string } }>("/email/smtp/test-config", input);
  return response.data;
}

export async function fetchEmailCampaigns(organizationId?: string | null) {
  const response = await apiGet<{ data: EmailCampaign[] }>(withOrgParams("/email-campaigns", organizationId));
  return response.data;
}

export async function saveEmailCampaign(input: SaveEmailCampaignInput) {
  if (input.campaignId) {
    const response = await apiPatch<{ data: EmailCampaign }>(`/email-campaigns/${input.campaignId}`, input);
    return response.data;
  }

  const response = await apiPost<{ data: EmailCampaign }>("/email-campaigns", input);
  return response.data;
}

export async function sendEmailCampaignTest(input: { campaignId: string; organizationId?: string | null; to_email: string; subject?: string | null; message?: string | null }) {
  const response = await apiPost<{ data: { ok: boolean; message: string } }>(`/email-campaigns/${input.campaignId}/send-test`, input);
  return response.data;
}

export async function startEmailCampaign(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: { ok: boolean; message: string } }>(`/email-campaigns/${input.campaignId}/start`, input);
  return response.data;
}

export async function pauseEmailCampaign(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: { ok: boolean } }>(`/email-campaigns/${input.campaignId}/pause`, input);
  return response.data;
}

export async function cancelEmailCampaign(input: { campaignId: string; organizationId?: string | null }) {
  const response = await apiPost<{ data: { ok: boolean } }>(`/email-campaigns/${input.campaignId}/cancel`, input);
  return response.data;
}

export async function fetchEmailCampaignReport(campaignId: string, organizationId?: string | null) {
  const response = await apiGet<{ data: EmailCampaignReport }>(withOrgParams(`/email-campaigns/${campaignId}/report`, organizationId));
  return response.data;
}

export async function fetchEmailCampaignRecipients(input: { campaignId: string; organizationId?: string | null; status?: string; q?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (input.organizationId) params.set("organization_id", input.organizationId);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.q?.trim()) params.set("q", input.q.trim());
  params.set("page", String(input.page ?? 1));
  params.set("limit", String(input.limit ?? 25));

  return apiGet<{ data: EmailCampaignRecipient[]; pagination: { page: number; limit: number; total: number } }>(
    `/email-campaigns/${input.campaignId}/recipients?${params.toString()}`
  );
}

export async function fetchEmailSuppressionList(input: { organizationId?: string | null; search?: string; reason?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (input.organizationId) params.set("organization_id", input.organizationId);
  if (input.search?.trim()) params.set("search", input.search.trim());
  if (input.reason?.trim()) params.set("reason", input.reason.trim());
  params.set("limit", String(input.limit ?? 100));
  params.set("offset", String(input.offset ?? 0));

  return apiGet<{ data: EmailSuppressionEntry[]; pagination: { limit: number; offset: number; total: number } }>(
    `/email-campaigns/suppression-list?${params.toString()}`
  );
}

export async function createEmailSuppression(input: { organizationId?: string | null; email: string; reason: EmailSuppressionReason; note?: string | null; source?: string | null }) {
  const response = await apiPost<{ data: EmailSuppressionEntry }>("/email-campaigns/suppression-list", input);
  return response.data;
}

export async function deleteEmailSuppression(input: { suppressionId: string; organizationId?: string | null }) {
  const response = await apiDelete<{ data: EmailSuppressionEntry }>(withOrgParams(`/email-campaigns/suppression-list/${input.suppressionId}`, input.organizationId));
  return response.data;
}

export async function fetchEmailCampaignHistory(organizationId?: string | null, limit = 50) {
  const response = await apiGet<{ data: EmailHistoryEntry[] }>(withOrgParams(`/email-campaigns/history?limit=${limit}`, organizationId));
  return response.data;
}
