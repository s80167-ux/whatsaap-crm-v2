export interface AuthProfile {
  id: string;
  organizationUserId: string | null;
  organizationId: string | null;
  email: string;
  fullName: string | null;
  role: "super_admin" | "org_admin" | "manager" | "agent" | "user";
  permissionKeys: string[];
}

export interface LoginResponse {
  token: string;
  user: AuthProfile;
}
