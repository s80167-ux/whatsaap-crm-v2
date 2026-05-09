import type { ReactNode } from "react";
import { useCampaignsModuleStatus } from "../../../hooks/useAdmin";
import { getStoredUser } from "../../../lib/auth";
import { canAccessCampaigns } from "../../../lib/moduleAccess";
import { AccessRestricted } from "./AccessRestricted";

export function CampaignsRouteGuard({ children }: { children: ReactNode }) {
  const user = getStoredUser();
  const shouldFetchStatus = user?.role === "org_admin";
  const moduleStatusQuery = useCampaignsModuleStatus(null, shouldFetchStatus);

  if (user?.role === "super_admin") {
    return <>{children}</>;
  }

  if (shouldFetchStatus && moduleStatusQuery.isLoading) {
    return <div className="p-6 text-sm text-text-muted">Checking Campaigns access...</div>;
  }

  const canAccess = canAccessCampaigns({
    role: user?.role,
    moduleEnabled: moduleStatusQuery.data?.isEnabled === true
  });

  if (!canAccess) {
    return <AccessRestricted />;
  }

  return <>{children}</>;
}
