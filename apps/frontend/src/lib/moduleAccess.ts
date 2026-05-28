import type { AuthProfile } from "../types/auth";

type CampaignsAccessInput = {
  role?: AuthProfile["role"] | null;
  permissionKeys?: string[] | null;
  parentModuleEnabled?: boolean | null;
  moduleEnabled?: boolean | null;
};

export const BUSINESS_PERMISSION_KEYS = [
  "campaign.view",
  "campaign.create",
  "campaign.send",
  "campaign.pause",
  "campaign.cancel",
  "campaign.approve",
  "audience.view",
  "audience.create",
  "audience.import",
  "audience.sync_identity",
  "audience.archive",
  "audience.delete",
  "template.view",
  "template.create",
  "template.edit",
  "template.approve",
  "inbox.view",
  "inbox.reply",
  "crm.view",
  "crm.update",
  "sales.view",
  "sales.update",
  "settings.team_access",
  "settings.manage_access_limits"
] as const;

export function canAccessCampaigns(input: CampaignsAccessInput) {
  if (input.role === "super_admin") {
    return true;
  }

  const parentEnabled = input.parentModuleEnabled ?? true;
  const moduleEnabled = input.moduleEnabled ?? true;

  if (input.role === "org_admin") {
    return parentEnabled && moduleEnabled;
  }

  return parentEnabled && moduleEnabled && hasPermission(input.permissionKeys, "campaign.view");
}

export function hasPermission(permissionKeys: string[] | null | undefined, permissionKey: string) {
  return Boolean(permissionKeys?.includes(permissionKey));
}

export function isTemporarySalesRole(role?: AuthProfile["role"] | null) {
  // TODO: migrate the product role model to a first-class "sales" role in backend types and DB constraints.
  return role === "agent" || role === "user";
}

export function canSyncContactIdentity({
  permissionKeys,
  role
}: {
  permissionKeys?: string[] | null;
  role?: AuthProfile["role"] | null;
}) {
  if (role === "super_admin" || role === "org_admin") {
    return true;
  }

  if (isTemporarySalesRole(role)) {
    return hasPermission(permissionKeys, "audience.sync_identity");
  }

  return hasPermission(permissionKeys, "audience.sync_identity");
}
