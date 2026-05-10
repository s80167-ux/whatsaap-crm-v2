export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: "active" | "trial" | "suspended" | "closed";
  created_at: string;
}

export interface UserSummary {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "super_admin" | "org_admin" | "manager" | "agent" | "user";
  status: "invited" | "active" | "disabled";
  created_at: string;
}

export interface WhatsAppAccountSummary {
  id: string;
  organization_id: string;
  created_by?: string | null;
  name: string;
  phone_number: string | null;
  phone_number_normalized: string | null;
  status: string;
  display_name?: string | null;
  account_jid?: string | null;
  last_connected_at?: string | null;
  last_disconnected_at?: string | null;
  health_score?: number | null;
  history_sync_lookback_days?: number | null;
}

export interface GoogleSignupRequestSummary {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by_auth_user_id: string | null;
  approved_organization_id: string | null;
  approved_organization_user_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsAppSyncJobStatus =
  | "queued"
  | "running"
  | "receiving_events"
  | "processing_events"
  | "idle"
  | "completed"
  | "failed"
  | "cancelled";

export type WhatsAppSyncJobType = "contacts_sync" | "history_backfill" | "full_sync";

export interface WhatsAppSyncJobSummary {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  requested_by?: string | null;
  job_type: WhatsAppSyncJobType;
  lookback_days?: number | null;
  status: WhatsAppSyncJobStatus;
  raw_events_received: number;
  messages_processed: number;
  conversations_updated: number;
  contacts_processed?: number;
  failed_events: number;
  last_activity_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}
