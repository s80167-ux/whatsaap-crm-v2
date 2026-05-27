import { apiGet, apiPost } from "../lib/http";
import type { WhatsAppContactRecoverySummary } from "./admin";

export type WhatsAppContactRecoveryAuditLog = {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  contact_id?: string | null;
  action: string;
  source: string;
  confidence_score?: number | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  reason?: string | null;
  raw_payload?: Record<string, unknown> | null;
  created_at: string;
};

export async function runWhatsAppContactRecovery(
  accountId: string,
  payload: { limit?: number; dryRun?: boolean } = {}
) {
  return apiPost<{
    success: boolean;
    dryRun: boolean;
    summary: WhatsAppContactRecoverySummary;
  }>(`/admin/whatsapp/${accountId}/recover-contacts`, payload);
}

export async function fetchWhatsAppContactRecoveryAudit(accountId: string, limit = 20) {
  const response = await apiGet<{ data: WhatsAppContactRecoveryAuditLog[] }>(
    `/admin/whatsapp/${accountId}/recovery-audit?limit=${encodeURIComponent(String(limit))}`
  );
  return response.data;
}
