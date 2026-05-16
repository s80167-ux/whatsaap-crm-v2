import type { ReactNode } from "react";
import { useCampaignsModuleStatus, useOrganizationModuleStatus } from "../../../hooks/useAdmin";
import { getStoredUser } from "../../../lib/auth";
import { canAccessCampaigns } from "../../../lib/moduleAccess";
import type { ModuleKey } from "../../../types/modules";
import { AccessRestricted } from "./AccessRestricted";

export function CampaignsRouteGuard({ children, moduleKey = "campaign" }: { children: ReactNode; moduleKey?: ModuleKey }) {
  const user = getStoredUser();
  const shouldFetchStatus = user?.role === "org_admin";
  const campaignStatusQuery = useCampaignsModuleStatus(null, shouldFetchStatus);
  const moduleStatusQuery = useOrganizationModuleStatus(moduleKey, null, shouldFetchStatus && moduleKey !== "campaign");

  if (user?.role === "super_admin") {
    return <>{children}</>;
  }

  if (shouldFetchStatus && (campaignStatusQuery.isLoading || moduleStatusQuery.isLoading)) {
    return <div className="p-6 text-sm text-text-muted">Checking Campaigns access...</div>;
  }

  const canAccess = canAccessCampaigns({
    role: user?.role,
    parentModuleEnabled: campaignStatusQuery.data?.isEnabled === true,
    moduleEnabled: moduleKey === "campaign" ? true : moduleStatusQuery.data?.isEnabled === true
  });

  if (!canAccess) {
    return <AccessRestricted />;
  }

  return <>{children}</>;
}
