export interface WhatsAppAccountRecord {
  id: string;
  organization_id: string;
  label: string | null;
  account_phone_e164: string | null;
  account_phone_normalized: string | null;
  connection_status: string;
  account_jid: string | null;
  display_name: string | null;
  history_sync_lookback_days?: number | null;
  reconnect_failure_count?: number | null;
  last_connection_error_code?: string | null;
  last_connection_error_message?: string | null;
  ban_suspected_at?: string | null;
  reconnect_suppressed_at?: string | null;
  connector_owner_id?: string | null;
  connector_claimed_at?: string | null;
  connector_heartbeat_at?: string | null;
}
