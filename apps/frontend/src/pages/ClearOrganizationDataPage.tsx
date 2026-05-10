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
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import type { ClearOrganizationDataCounts, ClearOrganizationDataPreview } from "../api/admin";
import { clearOrganizationData, fetchClearOrganizationDataPreview } from "../api/admin";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";

type PreviewMetric = {
  key: keyof ClearOrganizationDataCounts;
  label: string;
  tone: string;
  icon: ReactNode;
};

const PREVIEW_METRICS: PreviewMetric[] = [
  {
    key: "users",
    label: "Users",
    tone: "bg-slate-100 text-slate-700",
    icon: <Users size={16} />
  },
  {
    key: "whatsappAccounts",
    label: "WhatsApp Accounts",
    tone: "bg-sky-100 text-sky-700",
    icon: <MessageSquare size={16} />
  },
  {
    key: "contacts",
    label: "Contacts",
    tone: "bg-indigo-100 text-indigo-700",
    icon: <Users size={16} />
  },
  {
    key: "conversations",
    label: "Conversations",
    tone: "bg-cyan-100 text-cyan-700",
    icon: <MessageSquare size={16} />
  },
  {
    key: "messages",
    label: "Messages",
    tone: "bg-blue-100 text-blue-700",
    icon: <MessageSquare size={16} />
  },
  {
    key: "sales",
    label: "Sales Orders",
    tone: "bg-emerald-100 text-emerald-700",
    icon: <BadgeDollarSign size={16} />
  },
  {
    key: "activities",
    label: "Activities",
    tone: "bg-amber-100 text-amber-700",
    icon: <Database size={16} />
  },
  {
    key: "notifications",
    label: "Notifications",
    tone: "bg-orange-100 text-orange-700",
    icon: <AlertTriangle size={16} />
  },
  {
    key: "repairProposals",
    label: "Repair Proposals",
    tone: "bg-rose-100 text-rose-700",
    icon: <ShieldAlert size={16} />
  }
];

export function ClearOrganizationDataPage() {
  const { isSuperAdmin, selectedOrganizationId, selectedOrganizationName } =
    useOutletContext<DashboardOutletContext>();

  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClearOrganizationDataPreview | null>(null);

  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmationText, setConfirmationText] = useState("");
  const [checked, setChecked] = useState(false);

  const expectedText = useMemo(() => {
    if (!selectedOrganizationName) return "";
    return `CLEAR ${selectedOrganizationName}`;
  }, [selectedOrganizationName]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    setError(null);

    fetchClearOrganizationDataPreview(selectedOrganizationId)
      .then((data) => {
        setPreview(data);
      })
      .catch(() => {
        setError("Failed to load preview data");
      })
      .finally(() => setPreviewLoading(false));
  }, [selectedOrganizationId]);

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

  const handleClear = async () => {
    if (!selectedOrganizationId) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await clearOrganizationData(selectedOrganizationId, {
        confirmationText
      });

      setConfirmStep(0);
      setConfirmationText("");
      setChecked(false);
      setSuccessMessage(`Organization data cleared for ${selectedOrganizationName}.`);

      const refreshed = await fetchClearOrganizationDataPreview(selectedOrganizationId);
      setPreview(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear data");
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
                    Review operational volume, sales footprint, and data impact before clearing tenant-level CRM and WhatsApp records.
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">What stays</p>
            <div className="mt-3 space-y-2">
              <RetentionRow label="Organization record" value="Preserved" />
              <RetentionRow label="Database structure" value="Preserved" />
              <RetentionRow label="Tenant shell" value="Preserved" />
            </div>
            <div className="mt-3 rounded-xl border border-border bg-white/80 p-3 text-sm leading-5 text-text-muted">
              The page now separates operational counts from sales metrics so admins can judge both data volume and business impact before confirming.
            </div>
          </div>
        </div>
      </section>

      <Card elevated className="border-border bg-white p-0">
        <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex gap-3">
            <div className="rounded-xl bg-primary-soft p-2.5 text-primary">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Clearing removes live operating data</p>
              <p className="mt-1 text-sm leading-5 text-text-muted">
                Contacts, conversations, messages, sales records, and linked support tables will be removed for this organization.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background-tint px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft sm:tracking-[0.18em]">
            Review sales before continuing
          </div>
        </div>
      </Card>

      {successMessage ? (
        <Card elevated className="border-emerald-200 bg-emerald-50/70">
          <div className="flex items-center gap-3 text-emerald-800">
            <CheckCircle2 size={18} />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card elevated className="border-rose-200 bg-rose-50/70">
          <div className="flex items-center gap-3 text-rose-800">
            <AlertTriangle size={18} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] 2xl:gap-6">
        <div className="space-y-4">
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
              <SalesStat label="Total orders" value={formatCount(salesSummary?.totalOrders ?? 0)} tone="text-slate-900" />
              <SalesStat label="Open pipeline" value={formatCount(salesSummary?.openOrders ?? 0)} tone="text-sky-700" />
              <SalesStat label="Won orders" value={formatCount(salesSummary?.wonOrders ?? 0)} tone="text-emerald-700" />
              <SalesStat label="Lost orders" value={formatCount(salesSummary?.lostOrders ?? 0)} tone="text-rose-700" />
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]">
              <div className="workspace-subtle p-3.5 sm:p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text">Revenue snapshot</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
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
                  If won value or open pipeline value is still meaningful, require a manual sales export step before allowing deletion in production workflow.
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
                  <ArrowRight size={16} />
                  Clear data only after revenue review and acknowledgment
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <Card elevated>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Action Flow</p>
            <div className="mt-3 space-y-2">
              <FlowStep index="01" label="Review preview counts" active />
              <FlowStep index="02" label="Check sales impact" active={confirmStep >= 1} />
              <FlowStep index="03" label="Type confirmation and clear" active={confirmStep >= 2} />
            </div>
          </Card>

          <Card elevated className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Clear Action</p>
              <h2 className="mt-1 text-base font-semibold text-text">Destructive confirmation</h2>
            </div>

            {confirmStep === 0 ? (
              <Button variant="danger" className="w-full" onClick={() => setConfirmStep(1)}>
                Clear Organization Data
              </Button>
            ) : null}

            {confirmStep === 1 ? (
              <div className="space-y-3 rounded-[1rem] border border-border bg-background-tint/70 p-3">
                <div>
                  <p className="text-sm font-semibold text-text">Checkpoint</p>
                  <p className="mt-1 text-sm leading-5 text-text-muted">
                    This will remove live CRM, WhatsApp, and sales-related records for <span className="font-medium text-text">{selectedOrganizationName}</span>.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setConfirmStep(0)}>
                    Cancel
                  </Button>
                  <Button variant="danger" className="flex-1" onClick={() => setConfirmStep(2)}>
                    Continue
                  </Button>
                </div>
              </div>
            ) : null}

            {confirmStep === 2 ? (
              <div className="space-y-3 rounded-[1rem] border border-rose-200 bg-rose-50/70 p-3">
                <div>
                  <p className="text-sm font-semibold text-rose-950">Final confirmation</p>
                  <p className="mt-1 text-sm leading-5 text-rose-900">
                    Type the exact phrase below, then confirm that you understand this action is permanent.
                  </p>
                </div>

                <div className="rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold tracking-[0.03em] text-rose-900">
                  {expectedText}
                </div>

                <input
                  className="input-base"
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  placeholder="Enter confirmation text"
                />

                <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-white/80 px-3 py-2.5 text-sm text-rose-950">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setChecked(event.target.checked)}
                  />
                  <span>I understand that deleted organization data cannot be recovered from this screen.</span>
                </label>

                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setConfirmStep(1)} disabled={loading}>
                    Back
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={confirmationText !== expectedText || !checked || loading}
                    onClick={handleClear}
                  >
                    {loading ? "Clearing..." : "Confirm Clear"}
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
    <div className="clear-org-hero-stat rounded-[0.85rem] border border-border bg-white px-2.5 py-2.5 shadow-soft sm:rounded-[1rem] sm:px-3 sm:py-3">
      <div className="flex items-center gap-2 text-text-soft">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sm:text-xs sm:tracking-[0.16em]">{label}</span>
      </div>
      <p className="mt-1.5 min-w-0 break-words text-sm font-semibold text-text sm:mt-2 sm:text-base">{value}</p>
    </div>
  );
}

function RetentionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-white px-3 py-2.5">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
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
      <p className="mt-2 text-xl font-semibold tracking-tight text-text sm:mt-3 sm:text-2xl">{value}</p>
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
    <div className="clear-org-revenue-tile rounded-[0.85rem] border border-border bg-white px-2.5 py-2.5 shadow-soft sm:rounded-[0.95rem] sm:px-3 sm:py-3">
      <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-text-soft sm:text-xs sm:tracking-[0.16em]">{label}</p>
      <p className="mt-1.5 break-words text-sm font-semibold text-text sm:mt-2 sm:text-base">{value}</p>
    </div>
  );
}

function FlowStep({ index, label, active }: { index: string; label: string; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3 ${
        active
          ? "border-primary/20 bg-primary-soft text-text"
          : "border-border bg-background-tint/70 text-text-muted"
      }`}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
          active ? "bg-white text-primary shadow-soft" : "bg-white text-text-soft"
        }`}
      >
        {index}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
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
