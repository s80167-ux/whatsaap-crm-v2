import { apiGet, apiPost } from "../lib/http";

export type OpsHealthStatus = "healthy" | "warning" | "critical";
export type RawEventStatus = "pending" | "processing" | "failed" | "ignored" | "processed";
export type OutboxStatus = "pending" | "processing" | "failed" | "dispatched";

export interface OpsCenterSummary {
  total_active_whatsapp_accounts: number;
  disconnected_whatsapp_accounts: number;
  stale_connector_leases: number;
  raw_events_pending_count: number;
  raw_events_failed_count: number;
  message_outbox_pending_count: number;
  message_outbox_failed_count: number;
  campaign_dispatch_failed_count: number;
  latest_inbound_message_at: string | null;
  latest_outbound_message_at: string | null;
  system_health_status: OpsHealthStatus;
}

export interface OpsConnector {
  organization_id: string;
  organization_name: string;
  whatsapp_account_id: string;
  display_name: string | null;
  label: string | null;
  phone_number: string | null;
  connection_status: string;
  connector_owner_id: string | null;
  connector_heartbeat_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  health_status: OpsHealthStatus;
}

export interface OpsRawEvent {
  id: string;
  organization_name: string;
  event_type: string;
  event_key: string | null;
  status: RawEventStatus;
  attempts: number;
  error_message: string | null;
  created_at: string;
}

export interface OpsOutboxJob {
  id: string;
  organization_name: string;
  conversation_id: string;
  message_id: string;
  whatsapp_account_id: string;
  whatsapp_account_label: string | null;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface OpsCampaignDispatch {
  campaign_id: string;
  campaign_name: string;
  organization_name: string;
  status: string;
  pending_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  last_error: string | null;
}

export interface OpsOrganization {
  organization_id: string;
  organization_name: string;
  active_whatsapp_account_count: number;
  health_status: OpsHealthStatus;
  failed_raw_events_count: number;
  failed_outbox_count: number;
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export async function fetchOpsCenterSummary() {
  const response = await apiGet<{ data: OpsCenterSummary }>("/super-admin/ops-center/summary");
  return response.data;
}

export async function fetchOpsCenterConnectors() {
  const response = await apiGet<{ data: OpsConnector[] }>("/super-admin/ops-center/connectors");
  return response.data;
}

export async function fetchOpsCenterRawEvents(params: { organizationId?: string; status?: RawEventStatus | ""; limit?: number }) {
  const response = await apiGet<{ data: OpsRawEvent[] }>(`/super-admin/ops-center/raw-events${queryString(params)}`);
  return response.data;
}

export async function retryOpsRawEvent(eventId: string) {
  const response = await apiPost<{ data: OpsRawEvent }>(`/super-admin/ops-center/raw-events/${eventId}/retry`, {});
  return response.data;
}

export async function replayOpsRawEvents(payload: { organizationId: string; statuses?: RawEventStatus[]; limit?: number }) {
  const response = await apiPost<{ data: { updated: number } }>("/super-admin/ops-center/raw-events/replay", payload);
  return response.data;
}

export async function fetchOpsCenterOutbox(params: { organizationId?: string; status?: OutboxStatus | ""; limit?: number }) {
  const response = await apiGet<{ data: OpsOutboxJob[] }>(`/super-admin/ops-center/outbox${queryString(params)}`);
  return response.data;
}

export async function retryOpsOutboxJob(jobId: string) {
  const response = await apiPost<{ data: OpsOutboxJob }>(`/super-admin/ops-center/outbox/${jobId}/retry`, {});
  return response.data;
}

export async function fetchOpsCenterCampaignDispatch(params: { organizationId?: string; status?: string; campaignId?: string; limit?: number }) {
  const response = await apiGet<{ data: OpsCampaignDispatch[] }>(
    `/super-admin/ops-center/campaign-dispatch${queryString(params)}`
  );
  return response.data;
}

export async function rebuildOpsProjections(payload: {
  organizationId: string;
  scope: "organization" | "conversation" | "contact";
  conversationId?: string;
  contactId?: string;
}) {
  const response = await apiPost<{ data: Record<string, unknown> }>("/super-admin/ops-center/projections/rebuild", payload);
  return response.data;
}

export async function fetchOpsCenterOrganizations() {
  const response = await apiGet<{ data: OpsOrganization[] }>("/super-admin/ops-center/organizations");
  return response.data;
}
