export type UserRole = "super_admin" | "org_admin" | "manager" | "agent" | "user";

export interface AuthUser {
  authUserId: string;
  organizationUserId: string | null;
  organizationId: string | null;
  role: UserRole;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  permissionKeys: string[];
}
