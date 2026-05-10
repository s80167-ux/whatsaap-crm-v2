import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { CalendarDays, Database, Download, Filter, ShieldCheck } from "lucide-react";
import { downloadDataExport, type ExportDataset } from "../api/exports";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { useOrganizationUsers, useWhatsAppAccounts } from "../hooks/useAdmin";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";

const DATASETS: Array<{ value: ExportDataset; label: string; description: string }> = [
  { value: "contacts", label: "Contacts", description: "Contact profiles and ownership" },
  { value: "conversations", label: "Conversations", description: "Thread status and assignment" },
  { value: "messages", label: "Messages", description: "Inbound and outbound message history" },
  { value: "sales", label: "Sales", description: "Sales orders and totals" },
  { value: "campaigns", label: "Campaigns", description: "Campaign summary and delivery counts" }
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function DataExportPage() {
  const currentUser = getStoredUser();
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const canExport = currentUser?.role === "super_admin" || currentUser?.role === "org_admin";
  const activeOrganizationId = isSuperAdmin ? dashboardContext.selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const canLoadOrganizationScopedInputs = Boolean(activeOrganizationId);

  const [dataset, setDataset] = useState<ExportDataset>("contacts");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [whatsappAccountId, setWhatsappAccountId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: whatsappAccounts = [] } = useWhatsAppAccounts(activeOrganizationId, canLoadOrganizationScopedInputs);
  const { data: organizationUsers = [] } = useOrganizationUsers(activeOrganizationId, canLoadOrganizationScopedInputs);

  const selectedDataset = useMemo(
    () => DATASETS.find((item) => item.value === dataset) ?? DATASETS[0],
    [dataset]
  );

  const supportsWhatsAppFilter = dataset === "conversations" || dataset === "messages" || dataset === "campaigns";
  const supportsAssignedFilter = dataset === "contacts" || dataset === "conversations" || dataset === "messages" || dataset === "sales";
  const isAwaitingOrganization = isSuperAdmin && !activeOrganizationId;
  const isDownloadDisabled = !canExport || isAwaitingOrganization || isExporting;

  async function handleDownload() {
    if (!canExport) {
      setNotice("Only org admins and super admins can export CRM data.");
      return;
    }

    if (isAwaitingOrganization) {
      setNotice("Choose an organization before exporting data.");
      return;
    }

    setIsExporting(true);
    setNotice(null);

    try {
      const result = await downloadDataExport(dataset, {
        organizationId: isSuperAdmin ? activeOrganizationId : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        whatsappAccountId: supportsWhatsAppFilter && whatsappAccountId ? whatsappAccountId : undefined,
        assignedUserId: supportsAssignedFilter && assignedUserId ? assignedUserId : undefined
      });

      setNotice(`Export ready. ${result.rowCount.toLocaleString()} rows downloaded.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to download export.");
    } finally {
      setIsExporting(false);
    }
  }

  function resetFilters() {
    setCreatedFrom("");
    setCreatedTo("");
    setWhatsappAccountId("");
    setAssignedUserId("");
    setNotice(null);
  }

  if (!canExport) {
    return (
      <section className="space-y-6">
        <Card elevated className="workspace-block">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary-soft p-3 text-primary">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Data Export</p>
              <h1 className="mt-2 section-title">Admin access required</h1>
              <p className="section-copy mt-1">This workspace is available to org admins and super admins.</p>
            </div>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="workspace-page-header">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary-soft p-3 text-primary">
            <Database size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Data Export</p>
            <h1 className="mt-2 section-title">CRM downloads</h1>
            <p className="section-copy mt-1">
              {isSuperAdmin
                ? dashboardContext.selectedOrganizationName ?? "Choose an organization to begin."
                : "Download organization-scoped CRM data."}
            </p>
          </div>
        </div>
        <div className="workspace-subtle max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Access</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            {currentUser?.role === "super_admin" ? "Super admin" : "Org admin"} exports are recorded in audit history.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),22rem]">
        <Card elevated className="workspace-block">
          <div className="flex items-center gap-2">
            <Download size={18} className="text-primary" />
            <h2 className="text-lg font-semibold text-text">Export dataset</h2>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {DATASETS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setDataset(item.value);
                  setWhatsappAccountId("");
                  setAssignedUserId("");
                }}
                className={`min-h-[6.25rem] rounded-lg border px-3 py-3 text-left transition ${
                  dataset === item.value
                    ? "border-primary bg-primary-soft text-primary shadow-soft"
                    : "border-border bg-white text-text hover:border-primary/30 hover:bg-background-tint"
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-2 block text-xs leading-5 text-text-muted">{item.description}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="workspace-label">Created from</span>
              <Input type="date" value={createdFrom} max={createdTo || todayKey()} onChange={(event) => setCreatedFrom(event.target.value)} />
            </label>
            <label className="block">
              <span className="workspace-label">Created to</span>
              <Input type="date" value={createdTo} min={createdFrom || undefined} max={todayKey()} onChange={(event) => setCreatedTo(event.target.value)} />
            </label>
            <label className="block">
              <span className="workspace-label">WhatsApp account</span>
              <Select
                value={whatsappAccountId}
                disabled={!supportsWhatsAppFilter}
                onChange={(event) => setWhatsappAccountId(event.target.value)}
              >
                <option value="">All accounts</option>
                {whatsappAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.display_name ?? account.name ?? account.phone_number ?? account.id}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="workspace-label">Assigned user</span>
              <Select
                value={assignedUserId}
                disabled={!supportsAssignedFilter}
                onChange={(event) => setAssignedUserId(event.target.value)}
              >
                <option value="">All users</option>
                {organizationUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name ?? user.email ?? user.id}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {notice ? <p className="mt-4 text-sm leading-6 text-text-muted">{notice}</p> : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" onClick={resetFilters}>
              <Filter size={16} />
              Reset filters
            </Button>
            <Button onClick={handleDownload} disabled={isDownloadDisabled}>
              <Download size={16} />
              {isExporting ? "Preparing..." : "Download CSV"}
            </Button>
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="workspace-block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Selected export</p>
            <h3 className="mt-2 text-xl font-semibold text-text">{selectedDataset.label}</h3>
            <p className="mt-2 text-sm leading-6 text-text-muted">{selectedDataset.description}</p>
          </Card>

          <Card className="workspace-block">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <CalendarDays size={16} className="text-primary" />
              Date range
            </div>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              {createdFrom || createdTo
                ? `${createdFrom || "Start"} to ${createdTo || "Today"}`
                : "All available dates"}
            </p>
          </Card>
        </aside>
      </div>
    </section>
  );
}
