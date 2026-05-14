import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  Database,
  MessageSquare,
  ShieldAlert,
  ShoppingBag,
  Users
} from "lucide-react";
import { deleteOrganization, deleteUser, fetchUsers } from "../api/admin";
import type { ClearOrganizationDataCounts, ClearOrganizationDataPreview } from "../api/admin";
import { clearOrganizationData, fetchClearOrganizationDataPreview } from "../api/admin";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import type { UserSummary } from "../types/admin";

type PreviewMetric = {
  key: keyof ClearOrganizationDataCounts;
  label: string;
  tone: string;
  icon: ReactNode;
};

type ClearScope = "user" | "org_admin" | "organization";

const PREVIEW_METRICS: PreviewMetric[] = [
  {
    key: "users",
    label: "Users",
    tone: "bg-muted text-muted-foreground",
    icon: <Users size={16} />
  },
  {
    key: "whatsappAccounts",
    label: "WhatsApp Accounts",
    tone: "bg-primary/10 text-primary",
    icon: <MessageSquare size={16} />
  },
  {
    key: "contacts",
    label: "Contacts",
    tone: "bg-primary/10 text-primary",
    icon: <Users size={16} />
  },
  {
    key: "conversations",
    label: "Conversations",
    tone: "bg-primary/10 text-primary",
    icon: <MessageSquare size={16} />
  },
  {
    key: "messages",
    label: "Messages",
    tone: "bg-primary/10 text-primary",
    icon: <MessageSquare size={16} />
  },
  {
    key: "sales",
    label: "Sales Orders",
    tone: "bg-success/10 text-success",
    icon: <BadgeDollarSign size={16} />
  },
  {
    key: "activities",
    label: "Activities",
    tone: "bg-warning/10 text-warning",
    icon: <Database size={16} />
  },
  {
    key: "notifications",
    label: "Notifications",
    tone: "bg-warning/10 text-warning",
    icon: <AlertTriangle size={16} />
  },
  {
    key: "repairProposals",
    label: "Repair Proposals",
    tone: "bg-destructive/10 text-destructive",
    icon: <ShieldAlert size={16} />
  }
];

const SCOPE_OPTIONS: Array<{
  key: ClearScope;
  label: string;
  description: string;
}> = [
  {
    key: "user",
    label: "User",
    description: "Delete one selected user account under this organization."
  },
  {
    key: "org_admin",
    label: "Org Admin",
    description: "Delete all org admin accounts under this organization."
  },
  {
    key: "organization",
    label: "Organization",
    description: "Clear tenant data and optionally close the organization record."
  }
];

export function ClearOrganizationDataPage() {
  const { isSuperAdmin, selectedOrganizationId, selectedOrganizationName, setSelectedOrganizationId } =
    useOutletContext<DashboardOutletContext>();

  const [scope, setScope] = useState<ClearScope>("organization");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClearOrganizationDataPreview | null>(null);
  const [organizationUsers, setOrganizationUsers] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [closeOrganizationAfterClear, setCloseOrganizationAfterClear] = useState(false);

  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmationText, setConfirmationText] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setConfirmStep(0);
    setConfirmationText("");
    setChecked(false);
    setSuccessMessage(null);
    setError(null);
  }, [scope, selectedUserId, closeOrganizationAfterClear, selectedOrganizationId]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setPreview(null);
      setOrganizationUsers([]);
      return;
    }

    setPreviewLoading(true);
    setUsersLoading(true);
    setError(null);

    fetchClearOrganizationDataPreview(selectedOrganizationId)
      .then((data) => {
        setPreview(data);
      })
      .catch(() => {
        setError("Failed to load organization preview data");
      })
      .finally(() => setPreviewLoading(false));

    fetchUsers(selectedOrganizationId)
      .then((users) => {
        setOrganizationUsers(users.filter((user) => user.role !== "super_admin"));
      })
      .catch(() => {
        setError((current) => current ?? "Failed to load organization users");
      })
      .finally(() => setUsersLoading(false));
  }, [selectedOrganizationId]);

  const orgAdminUsers = useMemo(
    () => organizationUsers.filter((user) => user.role === "org_admin" && user.status !== "disabled"),
    [organizationUsers]
  );

  const selectedUser = useMemo(
    () => organizationUsers.find((user) => user.id === selectedUserId) ?? null,
    [organizationUsers, selectedUserId]
  );

  useEffect(() => {
    if (scope !== "user") {
      return;
    }

    if (!selectedUserId || !organizationUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(organizationUsers[0]?.id ?? "");
    }
  }, [scope, organizationUsers, selectedUserId]);

  const expectedText = useMemo(() => {
    if (scope === "user") {
      if (!selectedUser) {
        return "";
      }

      return `DELETE USER ${getUserLabel(selectedUser)}`;
    }

    if (scope === "org_admin") {
      if (!selectedOrganizationName) {
        return "";
      }

      return `DELETE ORG ADMINS ${selectedOrganizationName}`;
    }

    if (!selectedOrganizationName) {
      return "";
    }

    return `CLEAR ${selectedOrganizationName}`;
  }, [scope, selectedOrganizationName, selectedUser]);

  if (!isSuperAdmin) {
    return <div className="p-6">Access denied</div>;
  }

  if (!selectedOrganizationId) {
    return <div className="p-6">Please select an organization from the sidebar.</div>;
  }

  const counts = preview?.counts;
  const salesSummary = preview?.salesSummary;
  const totalTrackedRecords = counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : 0;
  const highImpactCount = counts
    ? counts.contacts + counts.conversations + counts.messages + counts.sales
    : 0;
  const selectedScopeMeta = SCOPE_OPTIONS.find((option) => option.key === scope);
  const canRunUserDelete = scope === "user" && Boolean(selectedUser);
  const canRunOrgAdminDelete = scope === "org_admin" && orgAdminUsers.length > 0;
  const canRunOrganizationClear = scope === "organization";
  const actionEnabled = canRunUserDelete || canRunOrgAdminDelete || canRunOrganizationClear;

  const handleAction = async () => {
    if (!selectedOrganizationId || !actionEnabled) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (scope === "user") {
        if (!selectedUser) {
          throw new Error("Select a user before continuing");
        }

        await deleteUser(selectedUser.id);
        setSuccessMessage(`User deleted: ${getUserLabel(selectedUser)}.`);
      } else if (scope === "org_admin") {
        for (const orgAdmin of orgAdminUsers) {
          await deleteUser(orgAdmin.id);
        }

        setSuccessMessage(
          orgAdminUsers.length === 1
            ? `Deleted 1 org admin from ${selectedOrganizationName}.`
            : `Deleted ${orgAdminUsers.length} org admins from ${selectedOrganizationName}.`
        );
      } else {
        await clearOrganizationData(selectedOrganizationId, {
          confirmationText
        });

        if (closeOrganizationAfterClear) {
          await deleteOrganization(selectedOrganizationId);
          setPreview(null);
          setOrganizationUsers([]);
          setSelectedOrganizationId("");
          setSuccessMessage(`Organization data cleared and organization closed for ${selectedOrganizationName}.`);
        } else {
          setSuccessMessage(`Organization data cleared for ${selectedOrganizationName}.`);
        }
      }

      setConfirmStep(0);
      setConfirmationText("");
      setChecked(false);

      if (!(scope === "organization" && closeOrganizationAfterClear)) {
        const [refreshedPreview, refreshedUsers] = await Promise.all([
          fetchClearOrganizationDataPreview(selectedOrganizationId),
          fetchUsers(selectedOrganizationId)
        ]);
        setPreview(refreshedPreview);
        setOrganizationUsers(refreshedUsers.filter((user) => user.role !== "super_admin"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete destructive action");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="clear-org-page space-y-3 sm:space-y-4">
      <section className="workspace-page-header p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ShieldAlert size={14} />
              Super Admin Action
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="rounded-[1rem] bg-primary-soft p-2.5 text-primary shadow-soft">
                  <Database size={20} />
                </div>
                <div>
                  <h1 className="section-title">Clear Organization Data</h1>
                  <p className="section-copy mt-1 max-w-2xl">
                    Use one destructive-actions console for a single user, all org admins, or the full organization cleanup flow before opening CRM access publicly.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <HeroStat label="Organization" value={selectedOrganizationName ?? "Unknown"} icon={<Building2 size={16} />} />
                <HeroStat label="Tracked Records" value={formatCount(totalTrackedRecords)} icon={<Database size={16} />} />
                <HeroStat label="Core CRM Impact" value={formatCount(highImpactCount)} icon={<AlertTriangle size={16} />} />
              </div>
            </div>
          </div>

          <div className="workspace-subtle p-3.5 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Selected Scope</p>
            <div className="mt-3 space-y-2">
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    scope === option.key
                      ? "border-primary/30 bg-card text-text shadow-soft"
                      : "border-border bg-card/70 text-text-muted hover:bg-card"
                  }`}
                  onClick={() => setScope(option.key)}
                >
                  <div className="text-sm font-semibold text-text">{option.label}</div>
                  <div className="mt-1 text-sm leading-5 text-text-muted">{option.description}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-border bg-card/80 p-3 text-sm leading-5 text-text-muted">
              {selectedScopeMeta?.description}
            </div>
          </div>
        </div>
      </section>

      <Card elevated className="border-border p-0">
        <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex gap-3">
            <div className="rounded-xl bg-primary-soft p-2.5 text-primary">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Current destructive scope</p>
              <p className="mt-1 text-sm leading-5 text-text-muted">
                {scope === "user"
                  ? "Delete one selected account under this organization."
                  : scope === "org_admin"
                    ? "Delete all active org admin accounts under this organization."
                    : "Clear live CRM, WhatsApp, and sales data for this organization, with an option to close the organization record after cleanup."}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background-tint px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft sm:tracking-[0.18em]">
            {scope === "organization" ? "Review sales before continuing" : "Review affected accounts before continuing"}
          </div>
        </div>
      </Card>

      {successMessage ? (
        <Card elevated className="border-success/20 bg-success/10">
          <div className="flex items-center gap-3 text-success">
            <CheckCircle2 size={18} />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card elevated className="border-destructive/20 bg-destructive/10">
          <div className="flex items-center gap-3 text-destructive">
            <AlertTriangle size={18} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] 2xl:gap-6">
        <div className="space-y-4">
          {scope === "organization" ? (
            <>
              <section className="workspace-block p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Data Volume</p>
                    <h2 className="mt-1 text-base font-semibold text-text">Organization data preview</h2>
                  </div>
                  {previewLoading ? <span className="text-sm text-text-muted">Loading...</span> : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {PREVIEW_METRICS.map((metric) => (
                    <MetricCard
                      key={metric.key}
                      label={metric.label}
                      value={counts ? formatCount(counts[metric.key]) : "-"}
                      tone={metric.tone}
                      icon={metric.icon}
                    />
                  ))}
                </div>
              </section>

              <section className="workspace-block p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary-soft p-2.5 text-primary">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Sales Footprint</p>
                    <h2 className="mt-1 text-base font-semibold text-text">Sales data of the organization</h2>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <SalesStat label="Total orders" value={formatCount(salesSummary?.totalOrders ?? 0)} tone="text-text" />
                  <SalesStat label="Open pipeline" value={formatCount(salesSummary?.openOrders ?? 0)} tone="text-primary" />
                  <SalesStat label="Won orders" value={formatCount(salesSummary?.wonOrders ?? 0)} tone="text-success" />
                  <SalesStat label="Lost orders" value={formatCount(salesSummary?.lostOrders ?? 0)} tone="text-destructive" />
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]">
                  <div className="workspace-subtle p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-text">Revenue snapshot</p>
                      <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
                        Organization scope
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <RevenueTile label="Open pipeline value" value={formatCurrency(salesSummary?.pipelineValue ?? 0)} />
                      <RevenueTile label="Won value" value={formatCurrency(salesSummary?.wonValue ?? 0)} />
                      <RevenueTile label="Average order value" value={formatCurrency(salesSummary?.averageOrderValue ?? 0)} />
                    </div>
                  </div>

                  <div className="workspace-subtle p-3.5 sm:p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Logic Recommendation</p>
                    <p className="mt-2 text-sm leading-5 text-text">
                      Clear data first. If the organization should disappear from active usage afterward, enable the close option instead of introducing a hard purge path.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
                      <ArrowRight size={16} />
                      Clear data only after revenue review and acknowledgment
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {scope === "user" ? (
            <section className="workspace-block p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">User Scope</p>
                  <h2 className="mt-1 text-base font-semibold text-text">Select a user to delete</h2>
                </div>
                {usersLoading ? <span className="text-sm text-text-muted">Loading...</span> : null}
              </div>

              <div className="mt-4 space-y-3">
                <select
                  className="input-base"
                  aria-label="Select organization user to delete"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  {organizationUsers.length === 0 ? <option value="">No users available</option> : null}
                  {organizationUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getUserLabel(user)}
                    </option>
                  ))}
                </select>

                {selectedUser ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Role" value={selectedUser.role} tone="bg-muted text-muted-foreground" icon={<Users size={16} />} />
                    <MetricCard label="Status" value={selectedUser.status} tone="bg-primary/10 text-primary" icon={<ShieldAlert size={16} />} />
                    <MetricCard
                      label="Auth Account"
                      value={selectedUser.auth_user_id ? "Connected" : "Missing"}
                      tone="bg-primary/10 text-primary"
                      icon={<Database size={16} />}
                    />
                    <MetricCard
                      label="Created"
                      value={formatDate(selectedUser.created_at)}
                      tone="bg-warning/10 text-warning"
                      icon={<Building2 size={16} />}
                    />
                  </div>
                ) : (
                  <Card elevated className="border-border bg-background-tint/70 text-sm text-text-muted">
                    No organization user is available for deletion.
                  </Card>
                )}
              </div>
            </section>
          ) : null}

          {scope === "org_admin" ? (
            <section className="workspace-block p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Org Admin Scope</p>
                  <h2 className="mt-1 text-base font-semibold text-text">Org admins that will be deleted</h2>
                </div>
                {usersLoading ? <span className="text-sm text-text-muted">Loading...</span> : null}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <MetricCard label="Org Admins" value={formatCount(orgAdminUsers.length)} tone="bg-muted text-muted-foreground" icon={<Users size={16} />} />
                <MetricCard
                  label="All Org Users"
                  value={formatCount(organizationUsers.length)}
                  tone="bg-primary/10 text-primary"
                  icon={<Users size={16} />}
                />
                <MetricCard
                  label="Auth Accounts"
                  value={formatCount(orgAdminUsers.filter((user) => user.auth_user_id).length)}
                  tone="bg-primary/10 text-primary"
                  icon={<Database size={16} />}
                />
              </div>

              <div className="mt-4 space-y-2">
                {orgAdminUsers.length === 0 ? (
                  <Card elevated className="border-border bg-background-tint/70 text-sm text-text-muted">
                    No active org admin accounts found for this organization.
                  </Card>
                ) : (
                  orgAdminUsers.map((user) => (
                    <div key={user.id} className="rounded-xl border border-border bg-card px-3 py-3 shadow-soft">
                      <div className="text-sm font-semibold text-text">{getUserLabel(user)}</div>
                      <div className="mt-1 text-sm text-text-muted">
                        Role: {user.role} · Status: {user.status} · Auth: {user.auth_user_id ? "Connected" : "Missing"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </div>

        <aside>
          <Card elevated className="space-y-3 p-3 sm:p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Action Flow</p>
                <h2 className="mt-0.5 text-base font-semibold text-text">Destructive confirmation</h2>
              </div>
              <div className="rounded-full border border-border bg-background-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">
                Step {confirmStep + 1} / 3
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <FlowStep index="01" label="Review selected scope" active compact />
              <FlowStep index="02" label="Check impact summary" active={confirmStep >= 1} compact />
              <FlowStep index="03" label="Type confirmation and execute" active={confirmStep >= 2} compact />
            </div>

            {scope === "organization" ? (
              <label className="flex items-start gap-3 rounded-xl border border-border bg-background-tint/70 px-3 py-2.5 text-sm text-text">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={closeOrganizationAfterClear}
                  onChange={(event) => setCloseOrganizationAfterClear(event.target.checked)}
                />
                <span>Also close the organization record after clearing its data.</span>
              </label>
            ) : null}

            {confirmStep === 0 ? (
              <Button size="sm" variant="danger" className="w-full" onClick={() => setConfirmStep(1)} disabled={!actionEnabled}>
                {scope === "user"
                  ? "Delete Selected User"
                  : scope === "org_admin"
                    ? "Delete Org Admins"
                    : closeOrganizationAfterClear
                      ? "Clear Data And Close Organization"
                      : "Clear Organization Data"}
              </Button>
            ) : null}

            {confirmStep === 1 ? (
              <div className="space-y-2.5 rounded-[1rem] border border-border bg-background-tint/70 p-2.5">
                <div>
                  <p className="text-sm font-semibold text-text">Checkpoint</p>
                  <p className="mt-1 text-sm leading-5 text-text-muted">{getCheckpointCopy(scope, selectedOrganizationName, selectedUser, orgAdminUsers.length, closeOrganizationAfterClear)}</p>
                </div>
                <div className="flex gap-3">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => setConfirmStep(0)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="danger" className="flex-1" onClick={() => setConfirmStep(2)} disabled={!actionEnabled}>
                    Continue
                  </Button>
                </div>
              </div>
            ) : null}

            {confirmStep === 2 ? (
              <div className="space-y-2.5 rounded-[1rem] border border-destructive/20 bg-destructive/10 p-2.5">
                <div>
                  <p className="text-sm font-semibold text-destructive">Final confirmation</p>
                  <p className="mt-1 text-sm leading-5 text-destructive">
                    Type the exact phrase below, then confirm that you understand this action is permanent.
                  </p>
                </div>

                <div className="rounded-xl border border-destructive/20 bg-card px-3 py-2.5 text-sm font-semibold tracking-[0.03em] text-destructive">
                  {expectedText || "No target available"}
                </div>

                <input
                  className="input-base"
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  placeholder="Enter confirmation text"
                />

                <label className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-card/80 px-3 py-2 text-sm text-destructive">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setChecked(event.target.checked)}
                  />
                  <span>I understand that deleted data cannot be recovered from this screen.</span>
                </label>

                <div className="flex gap-3">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => setConfirmStep(1)} disabled={loading}>
                    Back
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="flex-1"
                    disabled={confirmationText !== expectedText || !checked || loading || !actionEnabled}
                    onClick={handleAction}
                  >
                    {loading
                      ? "Working..."
                      : scope === "user"
                        ? "Confirm User Delete"
                        : scope === "org_admin"
                          ? "Confirm Org Admin Delete"
                          : closeOrganizationAfterClear
                            ? "Confirm Clear And Close"
                            : "Confirm Clear"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function HeroStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="clear-org-hero-stat rounded-[0.85rem] border border-border bg-card px-2.5 py-2.5 shadow-soft sm:rounded-[1rem] sm:px-3 sm:py-3">
      <div className="flex items-center gap-2 text-text-soft">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sm:text-xs sm:tracking-[0.16em]">{label}</span>
      </div>
      <p className="mt-1.5 min-w-0 break-words text-sm font-semibold text-text sm:mt-2 sm:text-base">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  icon
}: {
  label: string;
  value: string;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <Card elevated className="clear-org-metric-card metric-card rounded-[0.85rem] p-2.5 sm:rounded-[1rem] sm:p-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          {icon}
        </span>
        <span className="min-w-0 text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-text-soft sm:text-[11px] sm:tracking-[0.16em]">
          {label}
        </span>
      </div>
      <p className="mt-2 break-words text-xl font-semibold tracking-tight text-text sm:mt-3 sm:text-2xl">{value}</p>
    </Card>
  );
}

function SalesStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card elevated className="clear-org-stat-card rounded-[0.85rem] p-2.5 sm:rounded-[1rem] sm:p-3.5">
      <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-text-soft sm:text-xs sm:tracking-[0.16em]">{label}</p>
      <p className={`mt-1.5 text-lg font-semibold sm:mt-2 sm:text-xl ${tone}`}>{value}</p>
    </Card>
  );
}

function RevenueTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="clear-org-revenue-tile rounded-[0.85rem] border border-border bg-card px-2.5 py-2.5 shadow-soft sm:rounded-[0.95rem] sm:px-3 sm:py-3">
      <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-text-soft sm:text-xs sm:tracking-[0.16em]">{label}</p>
      <p className="mt-1.5 break-words text-sm font-semibold text-text sm:mt-2 sm:text-base">{value}</p>
    </div>
  );
}

function FlowStep({
  index,
  label,
  active,
  compact = false
}: {
  index: string;
  label: string;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${
        active
          ? "border-primary/20 bg-primary-soft text-text"
          : "border-border bg-background-tint/70 text-text-muted"
      } ${compact ? "px-2 py-2 text-center" : "flex items-center gap-2.5 px-2.5 py-2 sm:px-3 sm:py-2.5"}`}
    >
      {compact ? (
        <>
          <span
            className={`mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
              active ? "bg-card text-primary shadow-soft" : "bg-card text-text-soft"
            }`}
          >
            {index}
          </span>
          <span className="mt-1 block text-[11px] font-medium leading-4">{label}</span>
        </>
      ) : (
        <>
          <span
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              active ? "bg-card text-primary shadow-soft" : "bg-card text-text-soft"
            }`}
          >
            {index}
          </span>
          <span className="text-sm font-medium leading-5">{label}</span>
        </>
      )}
    </div>
  );
}

function getCheckpointCopy(
  scope: ClearScope,
  organizationName: string | null,
  selectedUser: UserSummary | null,
  orgAdminCount: number,
  closeOrganizationAfterClear: boolean
) {
  if (scope === "user") {
    return selectedUser
      ? `This will delete the user account ${getUserLabel(selectedUser)} from ${organizationName}.`
      : "Select a user before continuing.";
  }

  if (scope === "org_admin") {
    return `This will delete ${orgAdminCount} org admin account${orgAdminCount === 1 ? "" : "s"} from ${organizationName}.`;
  }

  if (closeOrganizationAfterClear) {
    return `This will clear live CRM, WhatsApp, and sales data for ${organizationName}, then close the organization record.`;
  }

  return `This will remove live CRM, WhatsApp, and sales-related records for ${organizationName} while preserving the organization shell.`;
}

function getUserLabel(user: UserSummary) {
  return user.email ?? user.full_name ?? user.id;
}

function formatCount(value: number) {
  return value.toLocaleString("en-MY");
}

function formatCurrency(value: number) {
  return `RM ${value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
