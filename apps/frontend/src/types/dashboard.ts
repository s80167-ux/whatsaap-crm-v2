export interface DashboardMetric {
  label: string;
  value: number | string;
  hint: string;
}

export interface DashboardSummary {
  scope: "agent" | "admin" | "super_admin";
  metrics: DashboardMetric[];
}

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  status: "active" | "trial" | "suspended" | "closed";
  created_at: string;
}

export interface PlatformUsageSummary {
  totals: {
    inbound_messages: string;
    outbound_messages: string;
    active_contacts: string;
    connected_whatsapp_accounts: string;
  };
  daily: Array<{
    organization_id: string;
    usage_date: string;
    inbound_messages: number;
    outbound_messages: number;
    active_contacts: number;
    connected_whatsapp_accounts: number;
  }>;
}

export interface PlatformHealthSummary {
  accounts: Array<{
    id: string;
    organization_id: string;
    label: string | null;
    connection_status: string;
    connector_owner_id: string | null;
    connector_claimed_at: string | null;
    connector_heartbeat_at: string | null;
    health_score: string | null;
    latest_session_started_at: string | null;
    latest_session_connected_at: string | null;
    latest_session_ended_at: string | null;
    latest_session_end_reason: string | null;
  }>;
  recent_events: Array<{
    whatsapp_account_id: string;
    event_type: string;
    severity: string | null;
    created_at: string;
    payload: unknown;
  }>;
}

export interface PlatformAuditLog {
  id: string;
  organization_id: string | null;
  actor_auth_user_id: string | null;
  actor_organization_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_ip: string | null;
  request_user_agent: string | null;
  metadata: unknown;
  created_at: string;
}

export interface PlatformOutboundDispatchSummary {
  totals: {
    pending: string;
    processing: string;
    failed: string;
    dispatched_today: string;
  };
  receipts_totals: {
    pending: string;
    server_ack: string;
    device_delivered: string;
    read: string;
    played: string;
    failed: string;
  };
  receipts: Array<{
    id: string;
    organization_id: string;
    conversation_id: string;
    whatsapp_account_id: string;
    external_message_id: string;
    external_chat_id: string | null;
    content_text: string | null;
    ack_status: "pending" | "server_ack" | "device_delivered" | "read" | "played" | "failed";
    sent_at: string;
    delivered_at: string | null;
    read_at: string | null;
  }>;
  jobs: Array<{
    id: string;
    organization_id: string;
    message_id: string;
    whatsapp_account_id: string;
    recipient_jid: string;
    processing_status: "pending" | "processing" | "dispatched" | "failed";
    attempt_count: number;
    last_attempt_at: string | null;
    next_attempt_at: string | null;
    dispatched_at: string | null;
    connector_message_id: string | null;
    last_error: string | null;
    created_at: string;
  }>;
}
