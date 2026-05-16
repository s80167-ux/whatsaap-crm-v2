import type { AuthProfile } from "../types/auth";

type CampaignsAccessInput = {
  role?: AuthProfile["role"] | null;
  parentModuleEnabled?: boolean | null;
  moduleEnabled?: boolean | null;
};

export function canAccessCampaigns(input: CampaignsAccessInput) {
  if (input.role === "super_admin") {
    return true;
  }

  if (input.role === "org_admin") {
    const parentEnabled = input.parentModuleEnabled ?? true;
    const moduleEnabled = input.moduleEnabled ?? true;

    return parentEnabled && moduleEnabled;
  }

  return false;
}
