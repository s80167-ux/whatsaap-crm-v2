import clsx from "clsx";
import { Database, GitBranch, Network, SlidersHorizontal } from "lucide-react";
import { Navigate, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { SuperAdminFlowMap } from "../components/SuperAdminFlowMap";
import { SuperAdminDataStructureMap, SuperAdminOrganizationStructureMap } from "../components/SuperAdminStructureMaps";
import { getStoredUser } from "../lib/auth";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";

type SuperAdminMapTab = "workflow" | "data" | "organization";

const mapTabs: Array<{
  id: SuperAdminMapTab;
  to: string;
  label: string;
  description: string;
  icon: typeof GitBranch;
}> = [
  {
    id: "workflow",
    to: "/super-admin-map",
    label: "Platform workflow dashboard",
    description: "Cross-screen operating flow for super admin decisions, actions, and escalation paths.",
    icon: GitBranch
  },
  {
    id: "data",
    to: "/super-admin-map/data-structure",
    label: "Data structure map",
    description: "Database-oriented map of the main platform entities and how records connect.",
    icon: Database
  },
  {
    id: "organization",
    to: "/super-admin-map/organization-structure",
    label: "Organization user structure map",
    description: "Hierarchy and ownership view across organization, roles, accounts, and operational work.",
    icon: Network
  }
];

export function SuperAdminMapPage() {
  const user = getStoredUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedOrganizationId, selectedOrganizationName } = useOutletContext<DashboardOutletContext>();
  const activeTab = resolveActiveTab(location.pathname);
  const activeTabConfig = mapTabs.find((tab) => tab.id === activeTab) ?? mapTabs[0];
  const isSuperAdmin = user?.role === "super_admin";

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <section className="space-y-6">
      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Super Admin Map</p>
        <h2 className="mt-3 section-title">Platform structure boards</h2>
        <p className="mt-2 max-w-3xl section-copy">
          One place to review platform workflow, database-linked entities, and organization user structure.
        </p>

        <div className="mt-5 grid gap-3 xl:grid-cols-3">
          {mapTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.to)}
                className={clsx(
                  "flex min-h-[132px] flex-col items-start rounded-2xl border px-4 py-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-4",
                  isActive
                    ? "border-topbar bg-topbar text-topbar-foreground focus-visible:ring-ring/20"
                    : "border-border bg-card/80 text-text hover:border-primary/20 hover:bg-card focus-visible:ring-ring/20"
                )}
                aria-pressed={isActive}
              >
                <span
                  className={clsx(
                    "flex h-10 w-10 items-center justify-center rounded-xl border",
                    isActive ? "border-topbar-foreground/20 bg-topbar-foreground/10" : "border-border bg-background-tint"
                  )}
                >
                  <Icon size={18} />
                </span>
                <p className="mt-4 text-sm font-semibold tracking-tight">{tab.label}</p>
                <p className={clsx("mt-2 text-xs leading-5", isActive ? "text-topbar-foreground/70" : "text-text-muted")}>{tab.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-background-tint px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-soft">{activeTabConfig.label}</p>
          <p className="mt-1 text-sm text-text-muted">{activeTabConfig.description}</p>
        </div>
      </Card>

      <Card elevated className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Organization Access</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-text">Access & Limits</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Campaigns access and WhatsApp connection limits now live in the centralized access control page.
          </p>
        </div>

        {!selectedOrganizationId ? (
          <div className="rounded-2xl border border-border bg-background-tint px-4 py-3 text-sm text-text-muted">
            Select an organization from the sidebar to manage access and limits.
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">
                  <SlidersHorizontal size={17} />
                </span>
                <h4 className="text-base font-semibold text-text">Organization Access & Limits</h4>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Manage Campaigns and WhatsApp connection limits for {selectedOrganizationName ?? "the selected organization"}.
              </p>
            </div>

            <Button
              variant="primary"
              className="shrink-0"
              onClick={() => navigate("/super-admin/access-limits")}
            >
              Open Access & Limits
            </Button>
          </div>
        )}
      </Card>

      {activeTab === "workflow" ? <SuperAdminFlowMap /> : null}
      {activeTab === "data" ? <SuperAdminDataStructureMap /> : null}
      {activeTab === "organization" ? <SuperAdminOrganizationStructureMap /> : null}
    </section>
  );
}

function resolveActiveTab(pathname: string): SuperAdminMapTab {
  if (pathname.startsWith("/super-admin-map/organization-structure")) {
    return "organization";
  }

  if (pathname.startsWith("/super-admin-map/data-structure")) {
    return "data";
  }

  return "workflow";
}
