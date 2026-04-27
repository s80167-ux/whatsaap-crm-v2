import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { PopupOverlay } from "../components/PopupOverlay";
import { WhatsAppQrDisplay } from "../components/WhatsAppQrDisplay";
import { useOrganizations, useWhatsAppAccounts } from "../hooks/useAdmin";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Link2, PlugZap, RefreshCw, Trash2, Unplug, Zap } from "lucide-react";
import { useState } from "react";
import styles from "./dashboardPage.module.css";
import {
  backfillWhatsAppAccount,
  createWhatsAppAccount,
  disconnectWhatsAppAccount,
  deleteWhatsAppAccount,
  reconnectWhatsAppAccount,
  updateWhatsAppAccount
} from "../api/admin";
const WHATSAPP_HISTORY_SYNC_OPTIONS = [0, 1, 3, 7, 14, 30, 60, 90] as const;
const WHATSAPP_BACKFILL_OPTIONS = [7, 30, 90] as const;
type WhatsAppBackfillDays = (typeof WHATSAPP_BACKFILL_OPTIONS)[number];

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

  // Popup state
  const [showCreatePopup, setShowCreatePopup] = useState(false);

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
      await backfillWhatsAppAccount(accountId, lookbackDays);
      setNotice(`Sync request accepted for "${label}". WhatsApp history will update in the background.`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to start WhatsApp history sync");
    } finally {
      setBackfillingAccountId(null);
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
      <Card elevated>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">WhatsApp Account Management</h2>
            <p className="section-copy">Create and manage WhatsApp accounts for your organization.</p>
          </div>
          <Button
            variant="primary"
            className={`ml-auto px-4 py-2 text-sm font-semibold rounded ${styles.buttonNoShadow}`}
            onClick={() => setShowCreatePopup(true)}
            aria-label="Add WhatsApp Account"
          >
            Add WhatsApp Account
          </Button>
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
          <div className="space-y-3">
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
    <div className="space-y-4">
      <p className="text-sm text-text-soft">
        Choose how far back to sync for{" "}
        <strong>{backfillPopupAccount.name}</strong>.
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
        onClick={() =>
          handleBackfillAccount(
            backfillPopupAccount.id,
            backfillPopupAccount.name
          )
        }
      >
        Start Sync
      </Button>
    </div>
  ) : null}
</PopupOverlay>

      <Card elevated className="min-w-0 xl:col-span-3 mt-6">
        <h3 className="text-lg font-semibold text-text">WhatsApp accounts</h3>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-soft">
          <p className="min-w-0 flex-1">Auto-refreshes every 15 seconds while an organization is selected.</p>
          <Button variant="ghost" className="shrink-0 px-3 py-2 text-xs" disabled={isRefreshingAccounts} onClick={handleRefreshAccounts}>
            {isRefreshingAccounts ? "Refreshing..." : "Refresh status"}
          </Button>
        </div>
        <div className="mt-4 overflow-hidden border border-border bg-white text-sm shadow-soft">
          <div className="hidden grid-cols-[minmax(120px,1fr)_minmax(112px,0.85fr)_minmax(138px,0.95fr)_minmax(230px,1.4fr)_minmax(240px,1.45fr)] gap-3 border-b border-border bg-background-tint px-4 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-text-soft lg:grid">
            <p>Device Name</p>
            <p>Status</p>
            <p>Phone Number</p>
            <p>Device Info</p>
            <p>Actions</p>
          </div>
          <div className="divide-y divide-border">
            {accountPagination.visibleItems.map((account) => {
              const statusTone = getConnectionTone(account.status);
              const connected = isConnectedAccount(account.status);
              const phoneNumber = account.phone_number_normalized ?? account.phone_number ?? "No phone set";
              const selectedBackfillDays = backfillSelections[account.id] ?? 7;
              const isBackfillingThisAccount = backfillingAccountId === account.id;
              return (
                <div key={account.id} className="grid gap-4 px-4 py-4 text-text lg:grid-cols-[minmax(120px,1fr)_minmax(112px,0.85fr)_minmax(138px,0.95fr)_minmax(230px,1.4fr)_minmax(240px,1.45fr)] lg:items-center lg:gap-3">
                  {editingAccountId === account.id ? (
                    <form className="space-y-3 lg:col-span-5" onSubmit={(event) => handleUpdateAccount(event, account.id)}>
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
                        <div className="flex flex-wrap gap-2">
                          <span title={`Last connected: ${account.last_connected_at || "Never"}. Last disconnected: ${account.last_disconnected_at || "Never"}.`} className="inline-flex items-center gap-1.5 bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                            <Info className="h-3.5 w-3.5" />
                            Device Info
                          </span>
                          <span title={`Health score: ${account.health_score ?? "--"}`} className="inline-flex items-center gap-1.5 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <PlugZap className="h-3.5 w-3.5" />
                            Readiness
                          </span>
                          <span title={`History sync: ${formatHistorySyncWindow(account.history_sync_lookback_days ?? 7)}`} className="inline-flex items-center gap-1.5 bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
                            <Zap className="h-3.5 w-3.5" />
                            Webhooks
                          </span>
                        </div>
                        {account.status?.toLowerCase() === "qr_required" ? (
                          <div className="mt-4">
                            <WhatsAppQrDisplay accountId={account.id} />
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-text-soft lg:hidden">Actions</p>
                        <div className="flex flex-wrap gap-2">
                          {connected ? (
                            <Button
                              className="gap-1.5 bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600"
                              disabled={isWorking}
                              onClick={() => handleDisconnectAccount(account.id, account.name)}
                            >
                              <Unplug className="h-3.5 w-3.5" />
                              Disconnect
                            </Button>
                          ) : (
                            <Button
                              className="gap-1.5 bg-[#78bd2b] px-3 py-2 text-xs text-white hover:bg-[#64a421]"
                              disabled={isWorking}
                              onClick={() => handleReconnectAccount(account.id, account.name)}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Pair as New Device
                            </Button>
                          )}
                          <Button
                              variant="secondary"
                              className="gap-1.5 px-3 py-2 text-xs"
                              disabled={isWorking || isBackfillingThisAccount}
                              onClick={() =>setBackfillPopupAccount({ id: account.id, name: account.name })
    }
                            >
                      <Zap className="h-3.5 w-3.5" />
  {isBackfillingThisAccount ? "Requesting sync..." : "Sync WhatsApp History"}
</Button>
                          <Button variant="secondary" className="gap-1.5 px-3 py-2 text-xs" disabled={isWorking} onClick={() => beginEditAccount(account)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            className="gap-1.5 bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600"
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
