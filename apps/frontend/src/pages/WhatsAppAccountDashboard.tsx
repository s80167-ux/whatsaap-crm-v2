import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { PopupOverlay } from "../components/PopupOverlay";
import { WhatsAppQrDisplay } from "../components/WhatsAppQrDisplay";
import { useOrganizations, useWhatsAppAccounts } from "../hooks/useAdmin";
import { useRealtimeWhatsAppAccounts } from "../hooks/useRealtimeWhatsAppAccounts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookUser, Link2, RefreshCw, Trash2, Unplug, Zap } from "lucide-react";
import { useState } from "react";
import {
  backfillWhatsAppAccount,
  createWhatsAppAccount,
  disconnectWhatsAppAccount,
  deleteWhatsAppAccount,
  fetchLatestWhatsAppSyncJob,
  reconnectWhatsAppAccount,
  syncWhatsAppContacts,
  updateWhatsAppAccount
} from "../api/admin";
import type { WhatsAppSyncJobStatus, WhatsAppSyncJobSummary } from "../types/admin";
const WHATSAPP_HISTORY_SYNC_OPTIONS = [0, 1, 3, 7, 14, 30, 60, 90] as const;
const WHATSAPP_BACKFILL_OPTIONS = [7, 30, 90] as const;
type WhatsAppBackfillDays = (typeof WHATSAPP_BACKFILL_OPTIONS)[number];
const ACTIVE_SYNC_JOB_STATUSES: WhatsAppSyncJobStatus[] = ["queued", "running", "receiving_events", "processing_events"];

function formatSyncJobStatus(status: WhatsAppSyncJobStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Starting";
    case "receiving_events":
      return "Importing";
    case "processing_events":
      return "Processing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "idle":
      return "Waiting";
    default:
      return status;
  }
}

function describeSyncJob(job: WhatsAppSyncJobSummary) {
  const lookbackText = job.lookback_days ? `last ${job.lookback_days} days` : "the selected window";

  switch (job.status) {
    case "queued":
      return "Sync request received. Preparing WhatsApp reconnect.";
    case "running":
      return `Starting history sync for ${lookbackText}.`;
    case "receiving_events":
      return "Importing WhatsApp history into the queue.";
    case "processing_events":
      return "Processing imported messages into CRM records.";
    case "completed":
      return `Sync complete. ${job.messages_processed} messages processed and ${job.conversations_updated} conversations updated.`;
    case "failed":
      return job.error_message?.trim() || "Sync failed. Please retry or check the connector logs.";
    case "cancelled":
      return "Sync was cancelled before completion.";
    case "idle":
      return "No new sync activity detected recently. Review the counters below.";
    default:
      return "Sync status updated.";
  }
}

function getSyncJobProgress(status: WhatsAppSyncJobStatus) {
  switch (status) {
    case "queued":
      return 10;
    case "running":
      return 25;
    case "receiving_events":
      return 60;
    case "processing_events":
      return 85;
    case "completed":
      return 100;
    case "failed":
    case "cancelled":
      return 100;
    case "idle":
      return 92;
    default:
      return 0;
  }
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Just now";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function getSyncJobTone(status: WhatsAppSyncJobStatus) {
  switch (status) {
    case "completed":
      return {
        panel: "border-emerald-200 bg-emerald-50/70",
        badge: "bg-emerald-100 text-emerald-700",
        bar: "bg-emerald-500",
        text: "text-emerald-800"
      };
    case "failed":
    case "cancelled":
      return {
        panel: "border-rose-200 bg-rose-50/80",
        badge: "bg-rose-100 text-rose-700",
        bar: "bg-rose-500",
        text: "text-rose-800"
      };
    default:
      return {
        panel: "border-sky-200 bg-sky-50/70",
        badge: "bg-sky-100 text-sky-700",
        bar: "bg-sky-500",
        text: "text-sky-800"
      };
  }
}

function SyncJobStatusCard({
  accountId,
  seededJob,
  refreshKey
}: {
  accountId: string;
  seededJob?: WhatsAppSyncJobSummary | null;
  refreshKey: number;
}) {
  const query = useQuery({
    queryKey: ["whatsapp-sync-job", accountId, refreshKey],
    queryFn: () => fetchLatestWhatsAppSyncJob(accountId),
    initialData: seededJob ?? undefined,
    refetchInterval: (queryContext) => {
      const currentJob = queryContext.state.data;
      if (!currentJob) {
        return false;
      }
      return ACTIVE_SYNC_JOB_STATUSES.includes(currentJob.status) ? 4000 : false;
    }
  });

  const job = query.data;

  if (!job) {
    return null;
  }

  const tone = getSyncJobTone(job.status);
  const progress = getSyncJobProgress(job.status);

  return (
    <div className={`mt-4 rounded-2xl border px-4 py-4 ${tone.panel}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] ${tone.badge}`}>
              {formatSyncJobStatus(job.status)}
            </span>
            <span className="text-xs text-text-soft">
              {job.lookback_days ? `${job.lookback_days}-day history sync` : "History sync"}
            </span>
          </div>
          <p className={`mt-2 text-sm font-medium ${tone.text}`}>{describeSyncJob(job)}</p>
        </div>
        <p className="text-xs text-text-soft">
          Last activity {formatRelativeTime(job.last_activity_at ?? job.updated_at)}
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-3 grid gap-3 text-xs text-text-muted sm:grid-cols-3">
        <div className="rounded-xl bg-white/75 px-3 py-2">
          <p className="font-semibold text-text">Raw events</p>
          <p className="mt-1 text-sm font-semibold text-text">{job.raw_events_received}</p>
        </div>
        <div className="rounded-xl bg-white/75 px-3 py-2">
          <p className="font-semibold text-text">Messages processed</p>
          <p className="mt-1 text-sm font-semibold text-text">{job.messages_processed}</p>
        </div>
        <div className="rounded-xl bg-white/75 px-3 py-2">
          <p className="font-semibold text-text">Conversations updated</p>
          <p className="mt-1 text-sm font-semibold text-text">{job.conversations_updated}</p>
        </div>
      </div>

      {job.failed_events > 0 ? (
        <p className="mt-3 text-xs font-medium text-rose-700">
          {job.failed_events} event{job.failed_events === 1 ? "" : "s"} failed during processing.
        </p>
      ) : null}
    </div>
  );
}

function AccountActivityCard({
  title,
  detail,
  tone = "sky"
}: {
  title: string;
  detail: string;
  tone?: "sky" | "emerald";
}) {
  const tones = tone === "emerald"
    ? {
        panel: "border-emerald-200 bg-emerald-50/70",
        badge: "bg-emerald-100 text-emerald-700",
        text: "text-emerald-800"
      }
    : {
        panel: "border-sky-200 bg-sky-50/70",
        badge: "bg-sky-100 text-sky-700",
        text: "text-sky-800"
      };

  return (
    <div className={`mt-4 rounded-2xl border px-4 py-4 ${tones.panel}`}>
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] ${tones.badge}`}>
        {title}
      </span>
      <p className={`mt-2 text-sm font-medium ${tones.text}`}>{detail}</p>
    </div>
  );
}

function formatHistorySyncWindow(days: number | null | undefined) {
  if (!days) {
    return "New messages only";
  }
  return `Previous ${days} ${days === 1 ? "day" : "days"}`;
}

function formatConnectionStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getConnectionTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "connected") {
    return { dot: "bg-emerald-500", text: "text-emerald-700" };
  }
  if (["pairing", "reconnecting", "qr_required", "new"].includes(normalized)) {
    return { dot: "bg-amber-400", text: "text-amber-700" };
  }
  return { dot: "bg-red-500", text: "text-red-700" };
}

function isConnectedAccount(status: string) {
  return status.toLowerCase() === "connected";
}

export function WhatsAppAccountDashboard() {
  const [backfillPopupAccount, setBackfillPopupAccount] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { data: organizations = [] } = useOrganizations();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const activeOrganizationId = selectedOrganizationId || null;
  const { data: accounts = [], isFetching: isRefreshingAccounts, refetch: refetchAccounts } = useWhatsAppAccounts(activeOrganizationId);
  const accountPagination = usePanelPagination(accounts);

  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountHistorySyncLookbackDays, setAccountHistorySyncLookbackDays] = useState(7);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountEdit, setAccountEdit] = useState<{
    organizationId: string;
    name: string;
    phoneNumber: string;
    historySyncLookbackDays: number;
  }>({ organizationId: "", name: "", phoneNumber: "", historySyncLookbackDays: 7 });
  const [notice, setNotice] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [backfillSelections, setBackfillSelections] = useState<Record<string, WhatsAppBackfillDays>>({});
  const [backfillingAccountId, setBackfillingAccountId] = useState<string | null>(null);
  const [syncingContactsAccountId, setSyncingContactsAccountId] = useState<string | null>(null);
  const [syncJobRefreshKeys, setSyncJobRefreshKeys] = useState<Record<string, number>>({});
  const [syncJobSnapshots, setSyncJobSnapshots] = useState<Record<string, WhatsAppSyncJobSummary>>({});
  const [accountActivityNotice, setAccountActivityNotice] = useState<Record<string, { title: string; detail: string; tone?: "sky" | "emerald" }>>({});

  // Popup state
  const [showCreatePopup, setShowCreatePopup] = useState(false);

  useRealtimeWhatsAppAccounts(activeOrganizationId);

  function beginEditAccount(account: any) {
    setEditingAccountId(account.id);
    setAccountEdit({
      organizationId: account.organization_id,
      name: account.name,
      phoneNumber: account.phone_number ?? "",
      historySyncLookbackDays: account.history_sync_lookback_days ?? 7
    });
  }

  async function handleCreateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);
    try {
      await createWhatsAppAccount({
        organizationId: activeOrganizationId,
        name: accountName,
        phoneNumber: accountPhone || null,
        historySyncLookbackDays: accountHistorySyncLookbackDays
      });
      setAccountName("");
      setAccountPhone("");
      setAccountHistorySyncLookbackDays(7);
      setNotice("WhatsApp account created and session initialization started.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteAccount(accountId: string, label: string) {
    if (!window.confirm(`Delete WhatsApp account "${label}"?`)) {
      return;
    }
    setIsWorking(true);
    setNotice(null);
    try {
      await deleteWhatsAppAccount(accountId);
      setNotice("WhatsApp account deleted.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleUpdateAccount(event: React.FormEvent<HTMLFormElement>, accountId: string) {
    event.preventDefault();
    setIsWorking(true);
    setNotice(null);
    try {
      await updateWhatsAppAccount(accountId, {
        organizationId: accountEdit.organizationId,
        name: accountEdit.name,
        phoneNumber: accountEdit.phoneNumber || null,
        historySyncLookbackDays: accountEdit.historySyncLookbackDays
      });
      setEditingAccountId(null);
      setNotice("WhatsApp account updated.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReconnectAccount(accountId: string, label: string) {
    setIsWorking(true);
    setNotice(null);
    try {
      await reconnectWhatsAppAccount(accountId);
      setNotice(`Reconnect requested for "${label}".`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to reconnect WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleBackfillAccount(accountId: string, label: string) {
    const lookbackDays = backfillSelections[accountId] ?? 7;

    if (!window.confirm(`Sync WhatsApp history for "${label}" from the previous ${lookbackDays} days? This will reconnect the WhatsApp session.`)) {
      return;
    }

    setBackfillingAccountId(accountId);
    setNotice(null);

    try {
      const result = await backfillWhatsAppAccount(accountId, lookbackDays);
      setSyncJobSnapshots((current) => ({
        ...current,
        [accountId]: result.syncJob
      }));
      setSyncJobRefreshKeys((current) => ({
        ...current,
        [accountId]: (current[accountId] ?? 0) + 1
      }));
      setAccountActivityNotice((current) => ({
        ...current,
        [accountId]: {
          title: "History Sync",
          detail: `Sync started for "${label}". Live progress is shown here.`,
          tone: "sky"
        }
      }));
      setBackfillPopupAccount(null);
      setNotice(`Sync started for "${label}". Live progress is now shown on the account card.`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to start WhatsApp history sync");
    } finally {
      setBackfillingAccountId(null);
    }
  }

  async function handleSyncContacts(accountId: string, label: string) {
    if (!window.confirm(`Import all available WhatsApp contacts for "${label}" into CRM contacts?`)) {
      return;
    }

    setSyncingContactsAccountId(accountId);
    setNotice(null);

    try {
      const result = await syncWhatsAppContacts(accountId);
      setAccountActivityNotice((current) => ({
        ...current,
        [accountId]: {
          title: "Contacts Synced",
          detail: `${result.summary.imported} imported (${result.summary.created} new, ${result.summary.updated} updated, ${result.summary.skipped} skipped).`,
          tone: "emerald"
        }
      }));
      setNotice(
        `Contact sync complete for "${label}". Imported ${result.summary.imported} contacts (${result.summary.created} new, ${result.summary.updated} updated, ${result.summary.skipped} skipped).`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sync WhatsApp contacts");
    } finally {
      setSyncingContactsAccountId(null);
    }
  }

  async function handleDisconnectAccount(accountId: string, label: string) {
    if (!window.confirm(`Disconnect WhatsApp account "${label}"?`)) {
      return;
    }
    setIsWorking(true);
    setNotice(null);
    try {
      await disconnectWhatsAppAccount(accountId);
      setNotice(`Disconnect requested for "${label}".`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to disconnect WhatsApp account");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRefreshAccounts() {
    setNotice(null);
    await refetchAccounts();
  }

  return (
    <section className="space-y-6">
      <Card elevated className="workspace-block">
        <div className="workspace-page-header">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Channels</p>
            <h2 className="mt-3 section-title">WhatsApp Account Management</h2>
            <p className="section-copy mt-2">Create, pair, and maintain WhatsApp accounts for each organization without leaving the admin workspace.</p>
          </div>
          <div className="workspace-subtle max-w-xs p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Workspace focus</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Keep connection health, pairing, and history sync actions clear for non-technical operators.
            </p>
          </div>
        </div>
        {notice ? <p className="mt-4 text-sm text-coral">{notice}</p> : null}
      </Card>

      <PopupOverlay
        open={showCreatePopup}
        onClose={() => setShowCreatePopup(false)}
        title="Register WhatsApp account"
        panelClassName="max-w-md"
      >
        <form onSubmit={async (e) => {
          await handleCreateAccount(e);
          if (!isWorking && selectedOrganizationId) setShowCreatePopup(false);
        }}>
          <div className="workspace-form-panel space-y-3 p-4">
            <Select
              id="organization-select"
              name="organization"
              value={selectedOrganizationId}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
              required
            >
              <option value="">Select organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
            <Input
              id="account-name"
              name="accountName"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Sales line"
              required
            />
            <Input
              id="account-phone"
              name="accountPhone"
              value={accountPhone}
              onChange={(event) => setAccountPhone(event.target.value)}
              placeholder="+60123456789"
            />
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Sync previous messages</p>
              <Select
                id="account-history-sync"
                name="accountHistorySyncLookbackDays"
                value={String(accountHistorySyncLookbackDays)}
                onChange={(event) => setAccountHistorySyncLookbackDays(Number(event.target.value))}
              >
                {WHATSAPP_HISTORY_SYNC_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {formatHistorySyncWindow(days)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={isWorking || !selectedOrganizationId} className="w-full">
              Create account
            </Button>
          </div>
        </form>
      </PopupOverlay>

      <PopupOverlay
        open={Boolean(backfillPopupAccount)}
        onClose={() => setBackfillPopupAccount(null)}
        title="Sync WhatsApp History"
        panelClassName="max-w-md"
      >
        {backfillPopupAccount ? (
          <div className="workspace-form-panel space-y-4 p-4">
            <p className="text-sm text-text-soft">
              Choose how far back to sync for <strong>{backfillPopupAccount.name}</strong>.
            </p>

            <Select
              value={String(backfillSelections[backfillPopupAccount.id] ?? 7)}
              onChange={(event) => {
                const selectedDays = Number(event.target.value) as WhatsAppBackfillDays;

                setBackfillSelections((current) => ({
                  ...current,
                  [backfillPopupAccount.id]: selectedDays
                }));
              }}
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </Select>

            <Button
              className="w-full"
              onClick={() => handleBackfillAccount(backfillPopupAccount.id, backfillPopupAccount.name)}
            >
              Start Sync
            </Button>
          </div>
        ) : null}
      </PopupOverlay>

      <Card elevated className="workspace-block mt-6 min-w-0 xl:col-span-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text">WhatsApp accounts</h3>
            <p className="mt-2 text-sm text-text-muted">Monitor device health, scan QR pairing when needed, and trigger safe sync actions from one place.</p>
          </div>
          <div className="flex gap-2 items-center">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreatePopup(true)}
              aria-label="Add WhatsApp Account"
            >
              Add WhatsApp Account
            </Button>
            <Button variant="ghost" size="sm" className="shrink-0" disabled={isRefreshingAccounts} onClick={handleRefreshAccounts}>
              {isRefreshingAccounts ? "Refreshing..." : "Refresh status"}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-soft">
          <p className="min-w-0 flex-1">Auto-refreshes every 15 seconds while an organization is selected.</p>
        </div>
        <div className="workspace-table-wrap mt-4 overflow-hidden text-sm shadow-soft">
          <div className="hidden grid-cols-[minmax(120px,1fr)_minmax(112px,0.85fr)_minmax(138px,0.95fr)_minmax(230px,1.4fr)_minmax(240px,1.45fr)] gap-3 border-b border-border bg-background-tint px-4 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-text-soft lg:grid">
            <p>Device Name</p>
            <p>Status</p>
            <p>Phone Number</p>
            <p>Device Info</p>
            <p>Actions</p>
          </div>
          <div className="divide-y divide-border">
            {accountPagination.visibleItems.length === 0 ? (
              <div className="workspace-empty-state m-4 px-6 py-10">
                <p className="text-base font-semibold text-text">No WhatsApp accounts yet</p>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Add the first account to start pairing a device and syncing conversations for this organization.
                </p>
              </div>
            ) : accountPagination.visibleItems.map((account) => {
              const statusTone = getConnectionTone(account.status);
              const connected = isConnectedAccount(account.status);
              const phoneNumber = account.phone_number_normalized ?? account.phone_number ?? "No phone set";
              const isBackfillingThisAccount = backfillingAccountId === account.id;
              const isSyncingContactsThisAccount = syncingContactsAccountId === account.id;
              return (
                <div key={account.id} className="grid gap-4 px-4 py-4 text-text lg:grid-cols-[minmax(120px,1fr)_minmax(112px,0.85fr)_minmax(138px,0.95fr)_minmax(230px,1.4fr)_minmax(240px,1.45fr)] lg:items-center lg:gap-3">
                  {editingAccountId === account.id ? (
                    <form className="workspace-form-panel space-y-3 p-4 lg:col-span-5" onSubmit={(event) => handleUpdateAccount(event, account.id)}>
                      <Select
                        value={accountEdit.organizationId}
                        onChange={(event) => setAccountEdit((draft) => ({ ...draft, organizationId: event.target.value }))}
                        required
                      >
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                      </Select>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input
                          value={accountEdit.name}
                          onChange={(event) => setAccountEdit((draft) => ({ ...draft, name: event.target.value }))}
                          placeholder="Account name"
                          required
                        />
                        <Input
                          value={accountEdit.phoneNumber}
                          onChange={(event) => setAccountEdit((draft) => ({ ...draft, phoneNumber: event.target.value }))}
                          placeholder="+60123456789"
                        />
                        <Select
                          value={String(accountEdit.historySyncLookbackDays)}
                          onChange={(event) => setAccountEdit((draft) => ({ ...draft, historySyncLookbackDays: Number(event.target.value) }))}
                        >
                          {WHATSAPP_HISTORY_SYNC_OPTIONS.map((days) => (
                            <option key={days} value={days}>
                              {formatHistorySyncWindow(days)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" className="min-w-32" disabled={isWorking || !accountEdit.organizationId}>
                          Save changes
                        </Button>
                        <Button variant="secondary" className="min-w-32" disabled={isWorking} onClick={() => setEditingAccountId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Device Name</p>
                        <p className="break-words font-semibold leading-5 text-text">{account.name}</p>
                        <p className="mt-1 text-xs text-text-soft">{organizations.find((o) => o.id === account.organization_id)?.name}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Status</p>
                        <span className={`inline-flex min-w-0 items-center gap-2 font-medium ${statusTone.text}`}>
                          <span className={`h-3 w-3 shrink-0 rounded-full ${statusTone.dot}`} />
                          {formatConnectionStatus(account.status)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Phone Number</p>
                        <p className="truncate font-mono text-sm tracking-wide text-text" title={phoneNumber}>
                          {phoneNumber}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Device Info</p>
                        {account.status?.toLowerCase() === "qr_required" ? (
                          <div className="mt-4">
                            <WhatsAppQrDisplay accountId={account.id} />
                          </div>
                        ) : null}
                        {isSyncingContactsThisAccount ? (
                          <AccountActivityCard
                            title="Syncing Contacts"
                            detail="Importing WhatsApp contacts into CRM. This may take a moment."
                            tone="sky"
                          />
                        ) : null}
                        {syncJobSnapshots[account.id] || syncJobRefreshKeys[account.id] ? (
                          <SyncJobStatusCard
                            accountId={account.id}
                            seededJob={syncJobSnapshots[account.id]}
                            refreshKey={syncJobRefreshKeys[account.id] ?? 0}
                          />
                        ) : null}
                        {!isSyncingContactsThisAccount && !syncJobSnapshots[account.id] && !syncJobRefreshKeys[account.id] && accountActivityNotice[account.id] ? (
                          <AccountActivityCard
                            title={accountActivityNotice[account.id].title}
                            detail={accountActivityNotice[account.id].detail}
                            tone={accountActivityNotice[account.id].tone}
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Actions</p>
                        <div className="flex flex-wrap gap-2">
                          {connected ? (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={isWorking}
                              onClick={() => handleDisconnectAccount(account.id, account.name)}
                            >
                              <Unplug className="h-3.5 w-3.5" />
                              Disconnect
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isWorking}
                              onClick={() => handleReconnectAccount(account.id, account.name)}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Pair as New Device
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            disabled={isWorking || isBackfillingThisAccount}
                            onClick={() => setBackfillPopupAccount({ id: account.id, name: account.name })}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            {isBackfillingThisAccount ? "Requesting sync..." : "Sync WhatsApp History"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            disabled={isWorking || isSyncingContactsThisAccount}
                            onClick={() => handleSyncContacts(account.id, account.name)}
                          >
                            <BookUser className="h-3.5 w-3.5" />
                            {isSyncingContactsThisAccount ? "Syncing contacts..." : "Sync Contacts"}
                          </Button>
                          <Button variant="secondary" size="sm" className="gap-1.5" disabled={isWorking} onClick={() => beginEditAccount(account)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isWorking}
                            onClick={() => handleDeleteAccount(account.id, account.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <PanelPagination
          className="mt-4"
          page={accountPagination.page}
          pageCount={accountPagination.pageCount}
          totalItems={accountPagination.totalItems}
          onPageChange={accountPagination.setPage}
        />
      </Card>
    </section>
  );
}
