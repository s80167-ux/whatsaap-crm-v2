import clsx from "clsx";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Workflow } from "lucide-react";
import { Navigate, useOutletContext } from "react-router-dom";
import {
  fetchOpsCenterCampaignDispatch,
  fetchOpsCenterConnectors,
  fetchOpsCenterOrganizations,
  fetchOpsCenterOutbox,
  fetchOpsCenterRawEvents,
  fetchOpsCenterSummary,
  rebuildOpsProjections,
  replayOpsRawEvents,
  retryOpsOutboxJob,
  retryOpsRawEvent,
  type OpsHealthStatus,
  type OutboxStatus,
  type RawEventStatus
} from "../api/opsCenter";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { PopupOverlay } from "../components/PopupOverlay";
import { Toast } from "../components/Toast";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";

type Confirmation =
  | { kind: "raw-retry"; id: string; label: string }
  | { kind: "raw-replay"; organizationId: string; label: string }
  | { kind: "outbox-retry"; id: string; label: string }
  | { kind: "projection-rebuild"; label: string };

const rawStatuses: Array<RawEventStatus | ""> = ["", "pending", "processing", "failed", "ignored", "processed"];
const outboxStatuses: Array<OutboxStatus | ""> = ["", "pending", "processing", "failed", "dispatched"];

export function SuperAdminOpsCenterPage() {
  const user = getStoredUser();
  const { isSuperAdmin } = useOutletContext<DashboardOutletContext>();
  const queryClient = useQueryClient();
  const [rawOrganizationId, setRawOrganizationId] = useState("");
  const [rawStatus, setRawStatus] = useState<RawEventStatus | "">("failed");
  const [rawLimit, setRawLimit] = useState(50);
  const [outboxOrganizationId, setOutboxOrganizationId] = useState("");
  const [outboxStatus, setOutboxStatus] = useState<OutboxStatus | "">("failed");
  const [outboxLimit, setOutboxLimit] = useState(50);
  const [projectionOrganizationId, setProjectionOrganizationId] = useState("");
  const [projectionScope, setProjectionScope] = useState<"organization" | "conversation" | "contact">("organization");
  const [conversationId, setConversationId] = useState("");
  const [contactId, setContactId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const summaryQuery = useQuery({ queryKey: ["ops-center", "summary"], queryFn: fetchOpsCenterSummary, enabled: isSuperAdmin });
  const organizationsQuery = useQuery({ queryKey: ["ops-center", "organizations"], queryFn: fetchOpsCenterOrganizations, enabled: isSuperAdmin });
  const connectorsQuery = useQuery({ queryKey: ["ops-center", "connectors"], queryFn: fetchOpsCenterConnectors, enabled: isSuperAdmin });
  const rawEventsQuery = useQuery({
    queryKey: ["ops-center", "raw-events", rawOrganizationId, rawStatus, rawLimit],
    queryFn: () => fetchOpsCenterRawEvents({ organizationId: rawOrganizationId, status: rawStatus, limit: rawLimit }),
    enabled: isSuperAdmin
  });
  const outboxQuery = useQuery({
    queryKey: ["ops-center", "outbox", outboxOrganizationId, outboxStatus, outboxLimit],
    queryFn: () => fetchOpsCenterOutbox({ organizationId: outboxOrganizationId, status: outboxStatus, limit: outboxLimit }),
    enabled: isSuperAdmin
  });
  const campaignDispatchQuery = useQuery({
    queryKey: ["ops-center", "campaign-dispatch"],
    queryFn: () => fetchOpsCenterCampaignDispatch({ limit: 50 }),
    enabled: isSuperAdmin
  });

  const organizations = organizationsQuery.data ?? [];
  const selectedReplayOrg = useMemo(
    () => organizations.find((organization) => organization.organization_id === rawOrganizationId) ?? null,
    [organizations, rawOrganizationId]
  );
  const summary = summaryQuery.data;

  const invalidateOps = async () => queryClient.invalidateQueries({ queryKey: ["ops-center"] });
  const showMutationError = (error: unknown) => setToast({ message: error instanceof Error ? error.message : "Action failed.", variant: "error" });
  const rawRetryMutation = useMutation({
    mutationFn: retryOpsRawEvent,
    onSuccess: async () => {
      await invalidateOps();
      setToast({ message: "Raw event queued for retry.", variant: "success" });
      setConfirmation(null);
    },
    onError: showMutationError
  });
  const rawReplayMutation = useMutation({
    mutationFn: replayOpsRawEvents,
    onSuccess: async (result) => {
      await invalidateOps();
      setToast({ message: `${result.updated} raw event${result.updated === 1 ? "" : "s"} replayed.`, variant: "success" });
      setConfirmation(null);
    },
    onError: showMutationError
  });
  const outboxRetryMutation = useMutation({
    mutationFn: retryOpsOutboxJob,
    onSuccess: async () => {
      await invalidateOps();
      setToast({ message: "Outbox job queued for retry.", variant: "success" });
      setConfirmation(null);
    },
    onError: showMutationError
  });
  const projectionMutation = useMutation({
    mutationFn: rebuildOpsProjections,
    onSuccess: async () => {
      await invalidateOps();
      setToast({ message: "Projection rebuild completed.", variant: "success" });
      setConfirmation(null);
    },
    onError: showMutationError
  });

  if (!isSuperAdmin || user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  const isActionPending = rawRetryMutation.isPending || rawReplayMutation.isPending || outboxRetryMutation.isPending || projectionMutation.isPending;

  function confirmAction() {
    if (!confirmation || isActionPending) return;
    if (confirmation.kind === "raw-retry") rawRetryMutation.mutate(confirmation.id);
    if (confirmation.kind === "raw-replay") rawReplayMutation.mutate({ organizationId: confirmation.organizationId, statuses: ["failed"], limit: rawLimit });
    if (confirmation.kind === "outbox-retry") outboxRetryMutation.mutate(confirmation.id);
    if (confirmation.kind === "projection-rebuild") {
      projectionMutation.mutate({
        organizationId: projectionOrganizationId,
        scope: projectionScope,
        conversationId: projectionScope === "conversation" ? conversationId.trim() : undefined,
        contactId: projectionScope === "contact" ? contactId.trim() : undefined
      });
    }
  }

  return (
    <section className="space-y-4">
      <Card elevated className="!p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Super Admin</p>
            <h1 className="mt-2 section-title">Super Admin Ops Center</h1>
            <p className="mt-1.5 max-w-3xl section-copy">Operational health, queues, connector status and recovery tools.</p>
          </div>
          <HealthBadge status={summary?.system_health_status ?? "warning"} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <HealthCard title="Active WhatsApp Accounts" value={summary?.total_active_whatsapp_accounts} loading={summaryQuery.isLoading} />
        <HealthCard title="Disconnected Accounts" value={summary?.disconnected_whatsapp_accounts} loading={summaryQuery.isLoading} />
        <HealthCard title="Stale Connector Leases" value={summary?.stale_connector_leases} loading={summaryQuery.isLoading} tone={summary?.stale_connector_leases ? "critical" : "normal"} />
        <HealthCard title="Raw Events Pending" value={summary?.raw_events_pending_count} loading={summaryQuery.isLoading} />
        <HealthCard title="Raw Events Failed" value={summary?.raw_events_failed_count} loading={summaryQuery.isLoading} tone={summary?.raw_events_failed_count ? "critical" : "normal"} />
        <HealthCard title="Outbox Pending" value={summary?.message_outbox_pending_count} loading={summaryQuery.isLoading} />
        <HealthCard title="Outbox Failed" value={summary?.message_outbox_failed_count} loading={summaryQuery.isLoading} tone={summary?.message_outbox_failed_count ? "critical" : "normal"} />
        <HealthCard title="Campaign Failed" value={summary?.campaign_dispatch_failed_count} loading={summaryQuery.isLoading} tone={summary?.campaign_dispatch_failed_count ? "warning" : "normal"} />
        <HealthCard title="Latest Inbound" value={formatDateTime(summary?.latest_inbound_message_at)} loading={summaryQuery.isLoading} />
        <HealthCard title="Latest Outbound" value={formatDateTime(summary?.latest_outbound_message_at)} loading={summaryQuery.isLoading} />
      </div>

      <OpsTableSection
        title="Connector Health"
        icon={<Activity size={17} />}
        query={connectorsQuery}
        columns={["Organization", "WhatsApp Account", "Status", "Owner", "Last Heartbeat", "Last Inbound", "Last Outbound", "Health", "Action"]}
        renderRows={(rows) => rows.map((connector) => (
          <tr key={connector.whatsapp_account_id}>
            <td>{connector.organization_name}</td>
            <td>{connector.display_name ?? connector.label ?? connector.phone_number ?? connector.whatsapp_account_id}</td>
            <td><StatusPill label={connector.connection_status} /></td>
            <td className="max-w-[10rem] truncate">{connector.connector_owner_id ?? "-"}</td>
            <td>{formatDateTime(connector.connector_heartbeat_at)}</td>
            <td>{formatDateTime(connector.last_inbound_at)}</td>
            <td>{formatDateTime(connector.last_outbound_at)}</td>
            <td><HealthBadge status={connector.health_status} compact /></td>
            <td><Button size="sm" variant="secondary" disabled>View Details</Button></td>
          </tr>
        ))}
      />

      <Card elevated className="!p-4 space-y-3">
        <SectionHeader title="Raw Event Queue" icon={<ShieldAlert size={17} />} />
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_8rem_auto]">
          <OrganizationSelect value={rawOrganizationId} onChange={setRawOrganizationId} organizations={organizations} allLabel="All organizations" />
          <Select value={rawStatus} onChange={(event) => setRawStatus(event.target.value as RawEventStatus | "")} className="border-border bg-card">
            {rawStatuses.map((status) => <option key={status || "all"} value={status}>{status || "All statuses"}</option>)}
          </Select>
          <Input type="number" min={1} max={200} value={rawLimit} onChange={(event) => setRawLimit(Number(event.target.value) || 50)} className="border-border bg-card" />
          <Button
            variant="secondary"
            disabled={!rawOrganizationId}
            onClick={() => setConfirmation({ kind: "raw-replay", organizationId: rawOrganizationId, label: `Replay failed raw events for ${selectedReplayOrg?.organization_name ?? "selected organization"}` })}
          >
            <RefreshCw size={16} />
            Replay Failed
          </Button>
        </div>
        <DataTable
          query={rawEventsQuery}
          columns={["Created", "Org", "Event Type", "Event Key", "Status", "Attempts", "Error", "Action"]}
          renderRows={(rows) => rows.map((event) => (
            <tr key={event.id}>
              <td>{formatDateTime(event.created_at)}</td>
              <td>{event.organization_name}</td>
              <td>{event.event_type}</td>
              <td className="max-w-[10rem] truncate">{event.event_key ?? "-"}</td>
              <td><StatusPill label={event.status} /></td>
              <td>{event.attempts}</td>
              <td className="max-w-[18rem] truncate">{event.error_message ?? "-"}</td>
              <td><Button size="sm" variant="secondary" disabled={!["failed", "processing"].includes(event.status)} onClick={() => setConfirmation({ kind: "raw-retry", id: event.id, label: `Retry raw event ${event.event_type}` })}>Retry</Button></td>
            </tr>
          ))}
        />
      </Card>

      <Card elevated className="!p-4 space-y-3">
        <SectionHeader title="Outbox Queue" icon={<RefreshCw size={17} />} />
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_8rem]">
          <OrganizationSelect value={outboxOrganizationId} onChange={setOutboxOrganizationId} organizations={organizations} allLabel="All organizations" />
          <Select value={outboxStatus} onChange={(event) => setOutboxStatus(event.target.value as OutboxStatus | "")} className="border-border bg-card">
            {outboxStatuses.map((status) => <option key={status || "all"} value={status}>{status || "All statuses"}</option>)}
          </Select>
          <Input type="number" min={1} max={200} value={outboxLimit} onChange={(event) => setOutboxLimit(Number(event.target.value) || 50)} className="border-border bg-card" />
        </div>
        <DataTable
          query={outboxQuery}
          columns={["Created", "Org", "WhatsApp Account", "Conversation", "Status", "Attempts", "Error", "Action"]}
          renderRows={(rows) => rows.map((job) => (
            <tr key={job.id}>
              <td>{formatDateTime(job.created_at)}</td>
              <td>{job.organization_name}</td>
              <td>{job.whatsapp_account_label ?? job.whatsapp_account_id}</td>
              <td className="max-w-[10rem] truncate">{job.conversation_id}</td>
              <td><StatusPill label={job.status} /></td>
              <td>{job.attempts}</td>
              <td className="max-w-[18rem] truncate">{job.last_error ?? "-"}</td>
              <td><Button size="sm" variant="secondary" disabled={!["failed", "processing"].includes(job.status)} onClick={() => setConfirmation({ kind: "outbox-retry", id: job.id, label: `Retry outbox job ${job.message_id}` })}>Retry</Button></td>
            </tr>
          ))}
        />
      </Card>

      <OpsTableSection
        title="Campaign Dispatch Health"
        icon={<Workflow size={17} />}
        query={campaignDispatchQuery}
        columns={["Campaign", "Org", "Status", "Pending", "Sent", "Failed", "Skipped", "Last Error"]}
        renderRows={(rows) => rows.map((campaign) => (
          <tr key={campaign.campaign_id}>
            <td>{campaign.campaign_name}</td>
            <td>{campaign.organization_name}</td>
            <td><StatusPill label={campaign.status} /></td>
            <td>{campaign.pending_count}</td>
            <td>{campaign.sent_count}</td>
            <td>{campaign.failed_count}</td>
            <td>{campaign.skipped_count}</td>
            <td className="max-w-[20rem] truncate">{campaign.last_error ?? "-"}</td>
          </tr>
        ))}
      />

      <Card elevated className="!p-4 space-y-3">
        <SectionHeader title="Projection Rebuild" icon={<Workflow size={17} />} />
        <div className="grid gap-3 lg:grid-cols-4">
          <OrganizationSelect value={projectionOrganizationId} onChange={setProjectionOrganizationId} organizations={organizations} allLabel="Choose organization" />
          <Select value={projectionScope} onChange={(event) => setProjectionScope(event.target.value as "organization" | "conversation" | "contact")} className="border-border bg-card">
            <option value="organization">Organization</option>
            <option value="conversation">Conversation</option>
            <option value="contact">Contact</option>
          </Select>
          {projectionScope === "conversation" ? (
            <Input value={conversationId} onChange={(event) => setConversationId(event.target.value)} placeholder="Conversation ID" className="border-border bg-card" />
          ) : projectionScope === "contact" ? (
            <Input value={contactId} onChange={(event) => setContactId(event.target.value)} placeholder="Contact ID" className="border-border bg-card" />
          ) : (
            <div className="border border-border bg-background-tint px-3 py-2 text-sm text-text-muted">Targeted organization rebuild</div>
          )}
          <Button disabled={!canSubmitProjection(projectionOrganizationId, projectionScope, conversationId, contactId)} onClick={() => setConfirmation({ kind: "projection-rebuild", label: `Rebuild ${projectionScope} projection` })}>
            <RefreshCw size={16} />
            Rebuild Projection
          </Button>
        </div>
      </Card>

      <PopupOverlay open={Boolean(confirmation)} onClose={() => !isActionPending && setConfirmation(null)} title="Confirm recovery action" description="This action will be recorded in audit logs." panelClassName="max-w-[min(32rem,calc(100vw-2rem))]">
        <div className="space-y-4">
          <div className="border border-warning/30 bg-warning/10 px-3 py-3 text-sm leading-6 text-text">{confirmation?.label}</div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={isActionPending} onClick={confirmAction}>{isActionPending ? "Working..." : "Confirm"}</Button>
            <Button className="flex-1" variant="secondary" disabled={isActionPending} onClick={() => setConfirmation(null)}>Cancel</Button>
          </div>
        </div>
      </PopupOverlay>

      <Toast message={toast?.message ?? null} variant={toast?.variant ?? "success"} onClose={() => setToast(null)} />
    </section>
  );
}

function OrganizationSelect({ allLabel, onChange, organizations, value }: { allLabel: string; onChange: (value: string) => void; organizations: Array<{ organization_id: string; organization_name: string }>; value: string }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} className="border-border bg-card">
      <option value="">{allLabel}</option>
      {organizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.organization_name}</option>)}
    </Select>
  );
}

function OpsTableSection<T>({ columns, icon, query, renderRows, title }: { columns: string[]; icon: ReactNode; query: QueryShape<T>; renderRows: (rows: T[]) => ReactNode; title: string }) {
  return (
    <Card elevated className="!p-4 space-y-3">
      <SectionHeader title={title} icon={icon} />
      <DataTable query={query} columns={columns} renderRows={renderRows} />
    </Card>
  );
}

type QueryShape<T> = { data?: T[]; isLoading: boolean; isError: boolean; refetch: () => void };

function DataTable<T>({ columns, query, renderRows }: { columns: string[]; query: QueryShape<T>; renderRows: (rows: T[]) => ReactNode }) {
  const rows = query.data ?? [];
  const pagination = usePanelPagination(rows);
  if (query.isLoading) return <div className="border border-border bg-background-tint px-4 py-8 text-sm text-text-muted">Loading...</div>;
  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>Unable to load this section.</span>
        <Button size="sm" variant="secondary" onClick={() => query.refetch()}>Retry</Button>
      </div>
    );
  }
  if (rows.length === 0) return <div className="border border-border bg-background-tint px-4 py-8 text-sm text-text-muted">No records found.</div>;
  return (
    <>
      <div className="workspace-table-wrap overflow-x-auto">
        <table className="workspace-table min-w-[880px]">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{renderRows(pagination.visibleItems)}</tbody>
        </table>
      </div>
      <PanelPagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
      />
    </>
  );
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-tint text-primary">{icon}</span>
      <h2 className="text-base font-semibold text-text">{title}</h2>
    </div>
  );
}

function HealthCard({ loading, title, tone = "normal", value }: { loading: boolean; title: string; tone?: "normal" | "warning" | "critical"; value?: number | string | null }) {
  return (
    <Card className={clsx("!p-4", tone === "critical" && "border-destructive/30 bg-destructive/10", tone === "warning" && "border-warning/30 bg-warning/10")}>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-soft">{title}</p>
      <p className={clsx("mt-2 text-xl font-semibold", tone === "critical" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-text")}>{loading ? "..." : value ?? "-"}</p>
    </Card>
  );
}

function HealthBadge({ compact = false, status }: { compact?: boolean; status: OpsHealthStatus }) {
  const label = status === "healthy" ? "Healthy" : status === "warning" ? "Warning" : "Critical";
  const Icon = status === "healthy" ? CheckCircle2 : AlertTriangle;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", !compact && "min-h-[2.25rem] px-3 text-xs", status === "healthy" && "border-success/20 bg-success/10 text-success", status === "warning" && "border-warning/30 bg-warning/10 text-warning", status === "critical" && "border-destructive/30 bg-destructive/10 text-destructive")}>
      <Icon size={compact ? 13 : 15} />
      {label}
    </span>
  );
}

function StatusPill({ label }: { label: string }) {
  return <span className="inline-flex min-h-[1.5rem] items-center border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</span>;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function canSubmitProjection(organizationId: string, scope: "organization" | "conversation" | "contact", conversationId: string, contactId: string) {
  if (!organizationId) return false;
  if (scope === "conversation") return Boolean(conversationId.trim());
  if (scope === "contact") return Boolean(contactId.trim());
  return true;
}
