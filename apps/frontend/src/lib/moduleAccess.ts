import type { AuthProfile } from "../types/auth";

type CampaignsAccessInput = {
  role?: AuthProfile["role"] | null;
  moduleEnabled?: boolean | null;
};

export function canAccessCampaigns(input: CampaignsAccessInput) {
  if (input.role === "super_admin") {
    return true;
  }

  if (input.role === "org_admin") {
    return input.moduleEnabled === true;
  }

  return false;
}
