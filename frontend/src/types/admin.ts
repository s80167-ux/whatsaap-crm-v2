export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export interface UserSummary {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string | null;
  role: "org_admin" | "manager" | "agent" | "user";
  status: "invited" | "active" | "disabled";
  created_at: string;
}

export interface WhatsAppAccountSummary {
  id: string;
  organization_id: string;
  name: string;
  phone_number: string | null;
  phone_number_normalized: string | null;
  status: string;
  baileys_session_key: string;
  auth_path: string;
}
