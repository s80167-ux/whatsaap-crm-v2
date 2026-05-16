import { useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, Clock3, RefreshCw, RotateCcw, Send, ServerCog, ShieldAlert, WifiOff } from "lucide-react";
import { retryPlatformOutboundDispatch } from "../api/dashboard";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { usePlatformAuditLogs, usePlatformHealth, usePlatformOrganizations, usePlatformOutboundDispatch, usePlatformUsage } from "../hooks/useDashboard";
import type { PlatformHealthSummary, PlatformOrganization } from "../types/dashboard";

type PlatformTab = "organizations" | "outbound" | "connectors" | "audit";

function formatAckStatusLabel(status: string) {
  switch (status) {
    case "server_ack":
      return "Sent";
    case "device_delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "played":
      return "Played";
    case "failed":
      return "Failed";
    case "pending":
    default:
      return "Pending";
  }
}

function formatCount(value: string | number | undefined, isLoading = false) {
  if (value === undefined || value === null) {
    return isLoading ? "..." : "0";
  }

  const numericValue = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : String(value);
}

function getNumber(value: string | number | undefined) {
  if (value === undefined || value === null) {
    return 0;
  }

  const numericValue = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "--";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "--";
}

function isConnectedStatus(status: string | null | undefined) {
  return String(status ?? "").toLowerCase() === "connected";
}

function isStaleHeartbeat(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  const ageMs = Date.now() - new Date(value).getTime();
  return Number.isFinite(ageMs) ? ageMs > 10 * 60 * 1000 : true;
}

function getOrganizationAccounts(accounts: PlatformHealthSummary["accounts"], organizationId: string) {
  return accounts.filter((account) => account.organization_id === organizationId);
}

function getOrganizationHealthLabel(organization: PlatformOrganization, accounts: PlatformHealthSummary["accounts"], failedJobs: number) {
  const organizationAccounts = getOrganizationAccounts(accounts, organization.id);
  const disconnectedAccounts = organizationAccounts.filter((account) => !isConnectedStatus(account.connection_status)).length;
  const staleAccounts = organizationAccounts.filter((account) => isStaleHeartbeat(account.connector_heartbeat_at)).length;

  if (organization.status === "suspended" || organization.status === "closed") {
    return { label: organization.status, tone: "text-destructive" };
  }

  if (failedJobs > 0 || disconnectedAccounts > 0 || staleAccounts > 0) {
    return { label: "needs attention", tone: "text-warning" };
  }

  return { label: "healthy", tone: "text-success" };
}

export function PlatformPage() {
  const queryClient = useQueryClient();
  const { data: organizations = [], isLoading: organizationsLoading } = usePlatformOrganizations();
  const { data: usage, isLoading: usageLoading } = usePlatformUsage();
  const { data: health, isLoading: healthLoading } = usePlatformHealth();
  const { data: auditLogs = [], isLoading: auditLogsLoading } = usePlatformAuditLogs();
  const { data: outboundDispatch, isLoading: outboundDispatchLoading } = usePlatformOutboundDispatch();
  const [outboundNotice, setOutboundNotice] = useState<string | null>(null);
  const [isRetryingOutbound, setIsRetryingOutbound] = useState(false);
  const [activeTab, setActiveTab] = useState<PlatformTab>("organizations");
  const organizationPagination = usePanelPagination(organizations);
  const connectorAccountPagination = usePanelPagination(health?.accounts ?? []);
  const connectorEventPagination = usePanelPagination(health?.recent_events ?? []);
  const outboundJobPagination = usePanelPagination(outboundDispatch?.jobs ?? []);
  const outboundReceiptPagination = usePanelPagination(outboundDispatch?.receipts ?? []);
  const auditLogPagination = usePanelPagination(auditLogs);

  async function handleRetryFailedOutbound() {
    setIsRetryingOutbound(true);
    setOutboundNotice(null);

    try {
      const result = await retryPlatformOutboundDispatch({ limit: 25, processNow: true });
      setOutboundNotice(`Retried ${result.retried} outbound jobs. Processed immediately: ${result.processed}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-outbound-dispatch"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-audit-logs"] })
      ]);
    } catch (error) {
      setOutboundNotice(error instanceof Error ? error.message : "Unable to retry outbound jobs");
    } finally {
      setIsRetryingOutbound(false);
    }
  }

  async function handleRefreshPlatform() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-usage"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-health"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-audit-logs"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-outbound-dispatch"] })
    ]);
  }

  const accounts = health?.accounts ?? [];
  const failedOutbound = getNumber(outboundDispatch?.totals.failed);
  const queuedOutbound = getNumber(outboundDispatch?.totals.pending);
  const processingOutbound = getNumber(outboundDispatch?.totals.processing);
  const disconnectedAccounts = accounts.filter((account) => !isConnectedStatus(account.connection_status)).length;
  const staleAccounts = accounts.filter((account) => isStaleHeartbeat(account.connector_heartbeat_at)).length;
  const receiptFailures = getNumber(outboundDispatch?.receipts_totals.failed);
  const suspendedOrganizations = organizations.filter((organization) => organization.status === "suspended" || organization.status === "closed").length;
  const organizationsWithFailedJobs = new Set((outboundDispatch?.jobs ?? []).filter((job) => job.processing_status === "failed").map((job) => job.organization_id)).size;
  const attentionTotal = failedOutbound + disconnectedAccounts + staleAccounts + receiptFailures + suspendedOrganizations;
  const platformState = attentionTotal > 0 ? (failedOutbound > 0 || disconnectedAccounts > 0 ? "Needs attention" : "Watch") : "Healthy";

  return (
    <section className="platform-page space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Platform</p>
            <h2 className="mt-3 section-title">Super admin overview</h2>
            <p className="mt-2 max-w-2xl section-copy">Tenant health, WhatsApp runtime, and delivery operations in one command view.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="platform-state-pill">
              {attentionTotal > 0 ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
              <span>{platformState}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleRefreshPlatform}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" disabled={isRetryingOutbound} onClick={handleRetryFailedOutbound}>
              <RotateCcw size={15} />
              {isRetryingOutbound ? "Retrying..." : "Retry failed"}
            </Button>
          </div>
        </div>
        {outboundNotice ? <p className="mt-3 text-sm text-text-muted">{outboundNotice}</p> : null}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <AttentionCard
          icon={<ShieldAlert size={18} />}
          label="Failed outbound"
          value={formatCount(outboundDispatch?.totals.failed, outboundDispatchLoading)}
          detail={`${organizationsWithFailedJobs} org${organizationsWithFailedJobs === 1 ? "" : "s"} affected`}
          tone={failedOutbound > 0 ? "critical" : "normal"}
        />
        <AttentionCard
          icon={<WifiOff size={18} />}
          label="Disconnected accounts"
          value={healthLoading ? "..." : disconnectedAccounts.toLocaleString()}
          detail="WhatsApp accounts not connected"
          tone={disconnectedAccounts > 0 ? "critical" : "normal"}
        />
        <AttentionCard
          icon={<Clock3 size={18} />}
          label="Stale heartbeat"
          value={healthLoading ? "..." : staleAccounts.toLocaleString()}
          detail="No heartbeat in 10 minutes"
          tone={staleAccounts > 0 ? "warning" : "normal"}
        />
        <AttentionCard
          icon={<AlertTriangle size={18} />}
          label="Receipt failures"
          value={formatCount(outboundDispatch?.receipts_totals.failed, outboundDispatchLoading)}
          detail="Provider delivery receipts failed"
          tone={receiptFailures > 0 ? "warning" : "normal"}
        />
        <AttentionCard
          icon={<Building2 size={18} />}
          label="Restricted orgs"
          value={organizationsLoading ? "..." : suspendedOrganizations.toLocaleString()}
          detail="Suspended or closed tenants"
          tone={suspendedOrganizations > 0 ? "warning" : "normal"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricTile icon={<Building2 size={17} />} label="Organizations" value={organizationsLoading ? "..." : organizations.length.toLocaleString()} />
        <MetricTile icon={<ServerCog size={17} />} label="Connected WA" value={formatCount(usage?.totals.connected_whatsapp_accounts, usageLoading)} />
        <MetricTile icon={<Send size={17} />} label="Inbound" value={formatCount(usage?.totals.inbound_messages, usageLoading)} />
        <MetricTile icon={<Send size={17} />} label="Outbound" value={formatCount(usage?.totals.outbound_messages, usageLoading)} />
        <MetricTile icon={<Clock3 size={17} />} label="Queued" value={queuedOutbound.toLocaleString()} loading={outboundDispatchLoading} />
        <MetricTile icon={<RefreshCw size={17} />} label="Processing" value={processingOutbound.toLocaleString()} loading={outboundDispatchLoading} />
      </div>

      <Card elevated className="p-0">
        <div className="border-b border-border px-3 py-3">
          <div className="platform-tabs grid gap-2 sm:grid-cols-4">
            {[
              { id: "organizations" as const, label: "Organizations" },
              { id: "outbound" as const, label: "Outbound Queue" },
              { id: "connectors" as const, label: "Connector Health" },
              { id: "audit" as const, label: "Audit Logs" }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? "platform-tab platform-tab--active" : "platform-tab"}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "organizations" ? (
          <div className="p-4 sm:p-5">
            <SectionHeading
              title="Organization health"
              description="A super-admin tenant list focused on account connectivity, queue risk, and tenant status."
            />
            <div className="workspace-table-wrap mt-4">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">WhatsApp health</th>
                    <th className="px-4 py-3">Queue risk</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {organizationsLoading ? (
                    <tr>
                      <td className="px-4 py-5 text-sm text-text-muted" colSpan={6}>
                        Loading organizations...
                      </td>
                    </tr>
                  ) : organizationPagination.visibleItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-5 text-sm text-text-muted" colSpan={6}>
                        No organizations found.
                      </td>
                    </tr>
                  ) : (
                    organizationPagination.visibleItems.map((organization) => {
                      const organizationAccounts = getOrganizationAccounts(accounts, organization.id);
                      const connectedCount = organizationAccounts.filter((account) => isConnectedStatus(account.connection_status)).length;
                      const failedJobs = (outboundDispatch?.jobs ?? []).filter(
                        (job) => job.organization_id === organization.id && job.processing_status === "failed"
                      ).length;
                      const healthLabel = getOrganizationHealthLabel(organization, accounts, failedJobs);

                      return (
                        <tr key={organization.id} className="table-row text-sm text-text-muted">
                          <td className="px-4 py-3">
                            <p className="font-medium text-text">{organization.name}</p>
                            <p className="mt-1 text-xs text-text-soft">{organization.slug}</p>
                          </td>
                          <td className="px-4 py-3 uppercase tracking-[0.14em] text-text-soft">{organization.status}</td>
                          <td className="px-4 py-3">
                            <span className={connectedCount === organizationAccounts.length && organizationAccounts.length > 0 ? "text-success" : "text-warning"}>
                              {connectedCount}/{organizationAccounts.length} connected
                            </span>
                          </td>
                          <td className={failedJobs > 0 ? "px-4 py-3 font-semibold text-destructive" : "px-4 py-3 text-text-muted"}>
                            {failedJobs > 0 ? `${failedJobs} failed` : "Clear"}
                          </td>
                          <td className="px-4 py-3">{formatDate(organization.created_at)}</td>
                          <td className={`px-4 py-3 font-semibold uppercase tracking-[0.12em] ${healthLabel.tone}`}>{healthLabel.label}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PanelPagination
              className="mt-4"
              page={organizationPagination.page}
              pageCount={organizationPagination.pageCount}
              totalItems={organizationPagination.totalItems}
              onPageChange={organizationPagination.setPage}
            />
          </div>
        ) : null}

        {activeTab === "connectors" ? (
          <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[1.45fr_1fr]">
            <div>
              <SectionHeading title="Connector accounts" description="Connection state, process ownership, and recent session heartbeat." />
              <div className="workspace-table-wrap mt-4">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Heartbeat</th>
                      <th className="px-4 py-3">Last session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthLoading ? (
                      <tr>
                        <td className="px-4 py-5 text-sm text-text-muted" colSpan={5}>
                          Loading connector diagnostics...
                        </td>
                      </tr>
                    ) : connectorAccountPagination.visibleItems.length === 0 ? (
                      <tr>
                        <td className="px-4 py-5 text-sm text-text-muted" colSpan={5}>
                          No connector accounts found.
                        </td>
                      </tr>
                    ) : (
                      connectorAccountPagination.visibleItems.map((account) => (
                        <tr key={account.id} className="table-row text-sm text-text-muted">
                          <td className="px-4 py-3 font-medium text-text">{account.label ?? account.id}</td>
                          <td className={isConnectedStatus(account.connection_status) ? "px-4 py-3 uppercase tracking-[0.14em] text-success" : "px-4 py-3 uppercase tracking-[0.14em] text-warning"}>
                            {account.connection_status}
                          </td>
                          <td className="px-4 py-3">{account.connector_owner_id ?? "--"}</td>
                          <td className={isStaleHeartbeat(account.connector_heartbeat_at) ? "px-4 py-3 text-warning" : "px-4 py-3 text-text-muted"}>
                            {formatDateTime(account.connector_heartbeat_at)}
                          </td>
                          <td className="px-4 py-3">
                            {account.latest_session_connected_at
                              ? formatDateTime(account.latest_session_connected_at)
                              : formatDateTime(account.latest_session_started_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PanelPagination
                className="mt-4"
                page={connectorAccountPagination.page}
                pageCount={connectorAccountPagination.pageCount}
                totalItems={connectorAccountPagination.totalItems}
                onPageChange={connectorAccountPagination.setPage}
              />
            </div>
            <div>
              <SectionHeading title="Recent connector events" description="Latest account-level runtime signals from the connector." />
              <div className="mt-4 space-y-3">
                {healthLoading ? (
                  <p className="text-sm text-text-muted">Loading connector events...</p>
                ) : connectorEventPagination.visibleItems.length === 0 ? (
                  <p className="text-sm text-text-muted">No connector events found.</p>
                ) : (
                  connectorEventPagination.visibleItems.map((event, index) => (
                    <div key={`${event.whatsapp_account_id}-${event.created_at}-${index}`} className="platform-event-row">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-text">{event.event_type}</p>
                        <p className="text-xs uppercase tracking-[0.14em] text-text-soft">{event.severity ?? "info"}</p>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">{event.whatsapp_account_id}</p>
                      <p className="mt-2 text-xs text-text-muted">{formatDateTime(event.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
              <PanelPagination
                className="mt-4"
                page={connectorEventPagination.page}
                pageCount={connectorEventPagination.pageCount}
                totalItems={connectorEventPagination.totalItems}
                onPageChange={connectorEventPagination.setPage}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "outbound" ? (
          <div className="space-y-5 p-4 sm:p-5">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <SectionHeading title="Outbound dispatch queue" description="Failed, pending, and processing jobs that can affect tenant delivery." />
                <Button variant="secondary" size="sm" disabled={isRetryingOutbound} onClick={handleRetryFailedOutbound}>
                  <RotateCcw size={15} />
                  {isRetryingOutbound ? "Retrying..." : "Retry failed jobs"}
                </Button>
              </div>
              <div className="workspace-table-wrap mt-4">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Recipient</th>
                      <th className="px-4 py-3">Attempts</th>
                      <th className="px-4 py-3">Last attempt</th>
                      <th className="px-4 py-3">Next retry</th>
                      <th className="px-4 py-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundDispatchLoading ? (
                      <tr>
                        <td className="px-4 py-5 text-sm text-text-muted" colSpan={6}>
                          Loading outbound dispatch queue...
                        </td>
                      </tr>
                    ) : outboundJobPagination.visibleItems.length === 0 ? (
                      <tr>
                        <td className="px-4 py-5 text-sm text-text-muted" colSpan={6}>
                          No outbound jobs found.
                        </td>
                      </tr>
                    ) : (
                      outboundJobPagination.visibleItems.map((job) => (
                        <tr key={job.id} className="table-row text-sm text-text-muted">
                          <td className={job.processing_status === "failed" ? "px-4 py-3 uppercase tracking-[0.14em] text-destructive" : "px-4 py-3 uppercase tracking-[0.14em] text-text-soft"}>{job.processing_status}</td>
                          <td className="px-4 py-3 font-medium text-text">{job.recipient_jid}</td>
                          <td className="px-4 py-3">{job.attempt_count}</td>
                          <td className="px-4 py-3">{formatDateTime(job.last_attempt_at)}</td>
                          <td className="px-4 py-3">{formatDateTime(job.next_attempt_at)}</td>
                          <td className="max-w-[22rem] truncate px-4 py-3">{job.last_error ?? "--"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PanelPagination
                className="mt-4"
                page={outboundJobPagination.page}
                pageCount={outboundJobPagination.pageCount}
                totalItems={outboundJobPagination.totalItems}
                onPageChange={outboundJobPagination.setPage}
              />
            </div>
            <div>
              <SectionHeading title="Recent outbound receipts" description="Provider acknowledgement state for recently dispatched messages." />
              <div className="workspace-table-wrap mt-4">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Ack</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3">Sent</th>
                      <th className="px-4 py-3">Delivered</th>
                      <th className="px-4 py-3">Read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundDispatchLoading ? (
                      <tr>
                        <td className="px-4 py-5 text-sm text-text-muted" colSpan={5}>
                          Loading outbound receipts...
                        </td>
                      </tr>
                    ) : outboundReceiptPagination.visibleItems.length === 0 ? (
                      <tr>
                        <td className="px-4 py-5 text-sm text-text-muted" colSpan={5}>
                          No outbound receipts found.
                        </td>
                      </tr>
                    ) : (
                      outboundReceiptPagination.visibleItems.map((receipt) => (
                        <tr key={receipt.id} className="table-row text-sm text-text-muted">
                          <td className={receipt.ack_status === "failed" ? "px-4 py-3 uppercase tracking-[0.14em] text-destructive" : "px-4 py-3 uppercase tracking-[0.14em] text-text-soft"}>
                            {formatAckStatusLabel(receipt.ack_status)}
                          </td>
                          <td className="max-w-[24rem] truncate px-4 py-3 font-medium text-text">{receipt.content_text ?? receipt.external_message_id}</td>
                          <td className="px-4 py-3">{formatDateTime(receipt.sent_at)}</td>
                          <td className="px-4 py-3">{formatDateTime(receipt.delivered_at)}</td>
                          <td className="px-4 py-3">{formatDateTime(receipt.read_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PanelPagination
                className="mt-4"
                page={outboundReceiptPagination.page}
                pageCount={outboundReceiptPagination.pageCount}
                totalItems={outboundReceiptPagination.totalItems}
                onPageChange={outboundReceiptPagination.setPage}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "audit" ? (
          <div className="p-4 sm:p-5">
            <SectionHeading title="Recent audit logs" description="Super-admin trace of platform actions and tenant-scoped changes." />
            <div className="workspace-table-wrap mt-4">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogsLoading ? (
                    <tr>
                      <td className="px-4 py-5 text-sm text-text-muted" colSpan={5}>
                        Loading audit logs...
                      </td>
                    </tr>
                  ) : auditLogPagination.visibleItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-5 text-sm text-text-muted" colSpan={5}>
                        No audit logs found.
                      </td>
                    </tr>
                  ) : (
                    auditLogPagination.visibleItems.map((log) => (
                      <tr key={log.id} className="table-row text-sm text-text-muted">
                        <td className="px-4 py-3 font-medium text-text">{log.action}</td>
                        <td className="px-4 py-3 uppercase tracking-[0.14em] text-text-soft">{log.actor_role ?? "--"}</td>
                        <td className="px-4 py-3">
                          {log.entity_type}
                          {log.entity_id ? `:${log.entity_id}` : ""}
                        </td>
                        <td className="px-4 py-3">{log.organization_id ?? "--"}</td>
                        <td className="px-4 py-3">{formatDateTime(log.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PanelPagination
              className="mt-4"
              page={auditLogPagination.page}
              pageCount={auditLogPagination.pageCount}
              totalItems={auditLogPagination.totalItems}
              onPageChange={auditLogPagination.setPage}
            />
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      <p className="mt-1 text-sm text-text-muted">{description}</p>
    </div>
  );
}

function AttentionCard({
  detail,
  icon,
  label,
  tone,
  value
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "critical" | "normal" | "warning";
  value: string;
}) {
  return (
    <div className={`platform-attention-card platform-attention-card--${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</p>
        <span className="platform-attention-icon">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{detail}</p>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  loading = false,
  value
}: {
  icon: ReactNode;
  label: string;
  loading?: boolean;
  value: string;
}) {
  return (
    <div className="platform-metric-tile">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-text-soft">{label}</p>
        <p className="mt-1 text-xl font-semibold text-text">{loading ? "..." : value}</p>
      </div>
    </div>
  );
}
