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
  live_connection_status?: string | null;
  live_connected?: boolean | null;
  live_status_error?: string | null;
  warmer_status?: string | null;
  warmer_warmup_days?: number | null;
  warmer_current_day?: number | null;
  warmer_daily_target?: number | null;
  warmer_today_warmed?: number | null;
  warmer_last_warmed_at?: string | null;
  warmer_next_warm_at?: string | null;
}

export type WhatsAppNumberWarmerStatus = "not_started" | "active" | "paused" | "completed";
export type WhatsAppNumberWarmerContactSource = "known_contacts";
export type WhatsAppNumberWarmerMessageSource = "warmup_templates";

export interface WhatsAppNumberWarmerProfile {
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
  contact_source: WhatsAppNumberWarmerContactSource;
  message_source: WhatsAppNumberWarmerMessageSource;
  manual_recipient_numbers: string[];
  auto_recipient_numbers: string[];
  status: WhatsAppNumberWarmerStatus;
  started_at?: string | null;
  paused_at?: string | null;
  completed_at?: string | null;
  last_warmed_at?: string | null;
  next_warm_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppNumberWarmerLog {
  id: string;
  level: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type WhatsAppAccountAccessRole = "owner" | "manager" | "agent" | "viewer";

export interface WhatsAppAccountAccessAccount {
  id: string;
  organization_id: string;
  created_by?: string | null;
  name: string;
  phone_number: string | null;
  phone_number_normalized: string | null;
  status: string;
  display_name?: string | null;
  owner_name?: string | null;
  access_count: number;
}

export interface WhatsAppAccountUserAccess {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  organization_user_id: string;
  access_role: WhatsAppAccountAccessRole;
  can_view: boolean;
  can_reply: boolean;
  can_create_sales: boolean;
  can_edit_sales: boolean;
  is_active: boolean;
  user?: {
    email: string | null;
    full_name: string | null;
    role: string | null;
    status: string | null;
  };
}

export interface WhatsAppAccountAccessOverview {
  organization_id: string;
  accounts: WhatsAppAccountAccessAccount[];
  users: UserSummary[];
}

export interface WhatsAppAccountAccessDetail {
  account: WhatsAppAccountAccessAccount;
  accessList: WhatsAppAccountUserAccess[];
  users: UserSummary[];
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
