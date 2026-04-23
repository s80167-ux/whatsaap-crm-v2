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
