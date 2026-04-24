import clsx from "clsx";
import { Database, GitBranch, Network } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { SuperAdminFlowMap } from "../components/SuperAdminFlowMap";
import { SuperAdminDataStructureMap, SuperAdminOrganizationStructureMap } from "../components/SuperAdminStructureMaps";
import { getStoredUser } from "../lib/auth";

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

  if (user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  const activeTab = resolveActiveTab(location.pathname);
  const activeTabConfig = mapTabs.find((tab) => tab.id === activeTab) ?? mapTabs[0];

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
                    ? "border-slate-950 bg-slate-950 text-white focus-visible:ring-slate-950/20"
                    : "border-border bg-white/80 text-text hover:border-slate-300 hover:bg-white focus-visible:ring-slate-400/20"
                )}
                aria-pressed={isActive}
              >
                <span
                  className={clsx(
                    "flex h-10 w-10 items-center justify-center rounded-xl border",
                    isActive ? "border-white/20 bg-white/10" : "border-border bg-background-tint"
                  )}
                >
                  <Icon size={18} />
                </span>
                <p className="mt-4 text-sm font-semibold tracking-tight">{tab.label}</p>
                <p className={clsx("mt-2 text-xs leading-5", isActive ? "text-white/70" : "text-text-muted")}>{tab.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-background-tint px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-soft">{activeTabConfig.label}</p>
          <p className="mt-1 text-sm text-text-muted">{activeTabConfig.description}</p>
        </div>
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
