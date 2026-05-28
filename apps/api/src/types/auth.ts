// Business roles are being simplified toward Super Admin, Org Admin, and Sales.
// TODO: add a first-class "sales" role in DB constraints and API contracts; for now Sales maps to agent/user plus permissions.
export type UserRole = "super_admin" | "org_admin" | "manager" | "agent" | "user";

export interface AuthUser {
  authUserId: string;
  organizationUserId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: UserRole;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  permissionKeys: string[];
}
