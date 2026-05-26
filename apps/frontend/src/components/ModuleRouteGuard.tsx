import type { ReactNode } from "react";
import { useOrganizationModuleStatus } from "../hooks/useAdmin";
import { getStoredUser } from "../lib/auth";
import type { ModuleKey } from "../types/modules";
import { LockedModulePage } from "./LockedModulePage";

type ModuleRouteGuardProps = {
  children: ReactNode;
  moduleKey: ModuleKey;
  moduleName: string;
};

export function ModuleRouteGuard({ children, moduleKey, moduleName }: ModuleRouteGuardProps) {
  const user = getStoredUser();
  const shouldCheckAccess = Boolean(user && user.role !== "super_admin");
  const moduleStatusQuery = useOrganizationModuleStatus(moduleKey, null, shouldCheckAccess);

  if (user?.role === "super_admin") {
    return <>{children}</>;
  }

  if (shouldCheckAccess && moduleStatusQuery.isLoading) {
    return <div className="p-6 text-sm text-text-muted">Checking {moduleName} access...</div>;
  }

  if (moduleStatusQuery.data?.isEnabled !== true) {
    return <LockedModulePage moduleName={moduleName} />;
  }

  return <>{children}</>;
}
