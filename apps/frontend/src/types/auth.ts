export interface AuthProfile {
  id: string;
  organizationUserId: string | null;
  organizationId: string | null;
  organizationName?: string | null;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  phone?: string | null;
  address?: string | null;
  // Business roles are being simplified toward Super Admin, Org Admin, and Sales.
  // TODO: add a first-class "sales" role in frontend/backend/DB; for now Sales maps to agent/user plus permissionKeys.
  role: "super_admin" | "org_admin" | "manager" | "agent" | "user";
  permissionKeys: string[];
}

export interface LoginResponse {
  user: AuthProfile;
}
