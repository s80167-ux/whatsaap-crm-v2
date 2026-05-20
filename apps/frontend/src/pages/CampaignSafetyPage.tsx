import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import {
  checkCampaignContentRisk,
  getCampaignSafetyPrecheck,
  getCampaignSafetySettings,
  listCampaignOptOuts,
  overrideCampaignSafetyWarnings,
  updateCampaignSafetySettings,
  upsertCampaignOptOut,
  validateCampaignRecipients,
  type CampaignPrecheck,
  type ContentRiskResult
} from "../api/campaignSafety";
import { Button } from "../components/Button";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { CampaignModuleTabs } from "../modules/campaigns/components/CampaignModuleTabs";
import { fetchCampaignRecipients, fetchCampaigns } from "../modules/campaigns/services/campaignService";
import type { Campaign } from "../modules/campaigns/types/campaign.types";

type Notice = { type: "success" | "error"; message: string };
type ActiveTab = "precheck" | "content" | "optouts" | "failed" | "settings";

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function statusClass(status: string) {
  if (status === "pass" || status === "low") return "border-success/20 bg-success/10 text-success";
  if (status === "warning" || status === "medium" || status === "high") return "border-warning/20 bg-warning/10 text-warning";
  return "border-destructive/20 bg-destructive/10 text-destructive";
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

function Badge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(value)}`}>{humanize(value)}</span>;
}

export function CampaignSafetyPage() {
  const { selectedOrganizationId, selectedOrganizationName } = useOutletContext<DashboardOutletContext>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>("precheck");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [precheck, setPrecheck] = useState<CampaignPrecheck | null>(null);
  const [contentMessage, setContentMessage] = useState("");
  const [contentResult, setContentResult] = useState<ContentRiskResult | null>(null);
  const [optOutForm, setOptOutForm] = useState({ phoneNumber: "", status: "opted_out" as "allowed" | "opted_out" | "blocked", reason: "" });
  const [notice, setNotice] = useState<Notice | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ["campaign-safety", "campaigns", selectedOrganizationId],
    queryFn: () => fetchCampaigns(selectedOrganizationId)
  });
  const optOutsQuery = useQuery({
    queryKey: ["campaign-safety", "opt-outs", selectedOrganizationId],
    queryFn: () => listCampaignOptOuts({ organizationId: selectedOrganizationId, limit: 100 })
  });
  const settingsQuery = useQuery({
    queryKey: ["campaign-safety", "settings", selectedOrganizationId],
    queryFn: () => getCampaignSafetySettings({ organizationId: selectedOrganizationId })
  });
  const failedRecipientsQuery = useQuery({
    queryKey: ["campaign-safety", "failed-recipients", selectedOrganizationId, selectedCampaignId],
    queryFn: () =>
      selectedCampaignId
        ? fetchCampaignRecipients({ campaignId: selectedCampaignId, organizationId: selectedOrganizationId, status: "failed", limit: 50 })
        : Promise.resolve({ data: [], pagination: { page: 1, limit: 50, total: 0 } }),
    enabled: activeTab === "failed" && Boolean(selectedCampaignId)
  });

  const campaigns = campaignsQuery.data ?? [];
  const activeCampaigns = campaigns.filter((campaign) => ["Sending", "Paused", "Scheduled"].includes(campaign.status));
  const failedToday = useMemo(() => campaigns.reduce((sum, campaign) => sum + Number(campaign.failed ?? 0), 0), [campaigns]);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const optOutRows = optOutsQuery.data ?? [];
  const optOutPagination = usePanelPagination(optOutRows);
  const failedRecipients = failedRecipientsQuery.data?.data ?? [];
  const failedRecipientsPagination = usePanelPagination(failedRecipients);

  const precheckMutation = useMutation({
    mutationFn: () => getCampaignSafetyPrecheck({ campaignId: selectedCampaignId, organizationId: selectedOrganizationId }),
    onSuccess: (result) => {
      setPrecheck(result);
      setNotice({ type: result.safety_status === "blocked" ? "error" : "success", message: `Pre-check ${humanize(result.safety_status)} with score ${result.safety_score}.` });
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to run pre-check." })
  });

  const validateMutation = useMutation({
    mutationFn: () => validateCampaignRecipients({ campaignId: selectedCampaignId, organizationId: selectedOrganizationId }),
    onSuccess: () => {
      setNotice({ type: "success", message: "Recipient validation refreshed." });
      void queryClient.invalidateQueries({ queryKey: ["campaign-safety"] });
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to validate recipients." })
  });

  const contentMutation = useMutation({
    mutationFn: () => checkCampaignContentRisk({ message: contentMessage }),
    onSuccess: setContentResult,
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to check content risk." })
  });

  const optOutMutation = useMutation({
    mutationFn: () =>
      upsertCampaignOptOut({
        organizationId: selectedOrganizationId,
        phoneNumber: optOutForm.phoneNumber,
        status: optOutForm.status,
        reason: optOutForm.reason || null
      }),
    onSuccess: () => {
      setOptOutForm({ phoneNumber: "", status: "opted_out", reason: "" });
      setNotice({ type: "success", message: "Opt-out preference saved." });
      void optOutsQuery.refetch();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save opt-out." })
  });

  const overrideMutation = useMutation({
    mutationFn: () =>
      overrideCampaignSafetyWarnings({
        campaignId: selectedCampaignId,
        organizationId: selectedOrganizationId,
        warningCodes: precheck?.warnings ?? [],
        note: "Warnings acknowledged from safety dashboard"
      }),
    onSuccess: () => setNotice({ type: "success", message: "Warnings acknowledged. You can start the campaign from the campaign screen." }),
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to acknowledge warnings." })
  });

  const settingsMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateCampaignSafetySettings({ organizationId: selectedOrganizationId, ...patch }),
    onSuccess: () => {
      setNotice({ type: "success", message: "Safety settings updated." });
      void settingsQuery.refetch();
    },
    onError: (error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to update settings." })
  });

  function selectedCampaignMessage() {
    return selectedCampaign ? `${selectedCampaign.name} - ${selectedCampaign.status}` : "Select campaign";
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <CampaignModuleTabs channel="whatsapp" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">WhatsApp Campaigns</p>
          <h1 className="mt-2 text-3xl font-semibold text-text">Campaign Safety</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Run pre-checks, validate recipients, manage opt-outs and tune pacing before campaigns leave the queue.
          </p>
          {selectedOrganizationName ? <p className="mt-1 text-xs text-text-soft">Workspace: {selectedOrganizationName}</p> : null}
        </div>
      </header>

      {notice ? (
        <div className={notice.type === "error" ? "rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" : "rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Active Campaigns" value={activeCampaigns.length} />
        <StatCard label="Blocked" value={campaigns.filter((campaign) => campaign.status === "Failed").length} />
        <StatCard label="Auto-paused" value={campaigns.filter((campaign) => campaign.status === "Paused").length} />
        <StatCard label="Failed Recipients" value={failedToday} />
        <StatCard label="Opted-out Contacts" value={optOutsQuery.data?.filter((row) => row.status === "opted_out").length ?? 0} />
        <StatCard label="Invalid Recipients" value={precheck?.recipient_summary.invalid_phone ?? 0} />
        <StatCard label="Daily Quota Used" value={precheck ? `${precheck.sending_summary.sent_today}/${precheck.sending_summary.daily_limit}` : "-"} />
        <StatCard label="Avg Failure Rate" value={campaigns.length ? `${Math.round((failedToday / Math.max(campaigns.reduce((sum, campaign) => sum + campaign.recipients, 0), 1)) * 100)}%` : "0%"} />
      </section>

      <div className="flex flex-wrap gap-2">
        {(["precheck", "content", "optouts", "failed", "settings"] as ActiveTab[]).map((tab) => (
          <Button key={tab} variant={activeTab === tab ? "primary" : "secondary"} onClick={() => setActiveTab(tab)}>
            {tab === "optouts" ? "Opt-out Manager" : tab === "failed" ? "Failed Recipients" : humanize(tab)}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => void campaignsQuery.refetch()}>
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>

      {(activeTab === "precheck" || activeTab === "failed") ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <label className="block max-w-xl">
            <span className="workspace-label">Campaign</span>
            <Select value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)}>
              <option value="">{selectedCampaignMessage()}</option>
              {campaigns.map((campaign: Campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name} - {campaign.status}</option>
              ))}
            </Select>
          </label>
        </section>
      ) : null}

      {activeTab === "precheck" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <Button disabled={!selectedCampaignId || precheckMutation.isPending} onClick={() => precheckMutation.mutate()}>
                <ShieldCheck size={16} /> Run Pre-check
              </Button>
              <Button variant="secondary" disabled={!selectedCampaignId || validateMutation.isPending} onClick={() => validateMutation.mutate()}>
                <CheckCircle2 size={16} /> Validate Recipients
              </Button>
              <Button variant="secondary" disabled={!precheck?.warnings.length || overrideMutation.isPending} onClick={() => overrideMutation.mutate()}>
                <AlertTriangle size={16} /> Acknowledge Warnings
              </Button>
            </div>

            {precheck ? (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge value={precheck.safety_status} />
                  <span className="text-sm font-semibold text-text">Safety score {precheck.safety_score}/100</span>
                </div>
                <IssueList title="Blocking errors" items={precheck.blocking_errors} />
                <IssueList title="Warnings" items={precheck.warnings} />
                <div className="grid gap-3 md:grid-cols-3">
                  <StatCard label="Valid" value={precheck.recipient_summary.valid} />
                  <StatCard label="Duplicate" value={precheck.recipient_summary.duplicate} />
                  <StatCard label="Opted Out" value={precheck.recipient_summary.opted_out} />
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm text-text-muted">Select a campaign and run pre-check to see safety status, score and send readiness.</p>
            )}
          </div>

          {precheck ? (
            <aside className="rounded-lg border border-border bg-background-tint p-4">
              <h2 className="text-sm font-semibold text-text">Sending Summary</h2>
              <dl className="mt-3 space-y-2 text-sm text-text-muted">
                <div className="flex justify-between gap-3"><dt>Account status</dt><dd>{precheck.sending_summary.account_status}</dd></div>
                <div className="flex justify-between gap-3"><dt>Remaining today</dt><dd>{precheck.sending_summary.remaining_today}</dd></div>
                <div className="flex justify-between gap-3"><dt>Rate/min</dt><dd>{precheck.sending_summary.rate_limit_per_minute}</dd></div>
                <div className="flex justify-between gap-3"><dt>Estimated duration</dt><dd>{precheck.sending_summary.estimated_duration_minutes} min</dd></div>
              </dl>
              <h2 className="mt-5 text-sm font-semibold text-text">Content Risk</h2>
              <div className="mt-2 flex items-center gap-2">
                <Badge value={precheck.content_summary.spam_risk_level} />
                <span className="text-sm text-text-muted">{precheck.content_summary.spam_risk_score}/100</span>
              </div>
            </aside>
          ) : null}
        </section>
      ) : null}

      {activeTab === "content" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <label className="block">
              <span className="workspace-label">Message Content</span>
              <textarea className="input-base min-h-52 w-full" value={contentMessage} onChange={(event) => setContentMessage(event.target.value)} />
            </label>
            <Button className="mt-3" disabled={!contentMessage.trim() || contentMutation.isPending} onClick={() => contentMutation.mutate()}>
              Check Content Risk
            </Button>
          </div>
          {contentResult ? (
            <aside className="rounded-lg border border-border bg-background-tint p-4">
              <Badge value={contentResult.spam_risk_level} />
              <p className="mt-2 text-2xl font-semibold text-text">{contentResult.spam_risk_score}/100</p>
              <IssueList title="Warnings" items={contentResult.warnings} />
              <IssueList title="Suggestions" items={contentResult.suggestions} />
            </aside>
          ) : null}
        </section>
      ) : null}

      {activeTab === "optouts" ? (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <h2 className="text-sm font-semibold text-text">Manual Preference</h2>
            <div className="mt-3 space-y-3">
              <Input value={optOutForm.phoneNumber} onChange={(event) => setOptOutForm((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+60123456789" />
              <Select value={optOutForm.status} onChange={(event) => setOptOutForm((current) => ({ ...current, status: event.target.value as typeof optOutForm.status }))}>
                <option value="opted_out">Opted out</option>
                <option value="blocked">Blocked</option>
                <option value="allowed">Allowed again</option>
              </Select>
              <Input value={optOutForm.reason} onChange={(event) => setOptOutForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason" />
              <Button disabled={!optOutForm.phoneNumber.trim() || optOutMutation.isPending} onClick={() => optOutMutation.mutate()}>Save Preference</Button>
            </div>
          </div>
          <div className="workspace-table-wrap overflow-x-auto">
            <table className="workspace-table min-w-[760px]">
              <thead><tr><th>Phone</th><th>Status</th><th>Source</th><th>Reason</th><th>Updated</th></tr></thead>
              <tbody>
                {optOutPagination.visibleItems.map((row) => (
                  <tr key={row.id}><td>{row.normalized_phone}</td><td><Badge value={row.status} /></td><td>{row.source || "-"}</td><td>{row.reason || "-"}</td><td>{formatDate(row.updated_at)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelPagination page={optOutPagination.page} pageCount={optOutPagination.pageCount} pageSize={optOutPagination.pageSize} totalItems={optOutPagination.totalItems} onPageChange={optOutPagination.setPage} />
        </section>
      ) : null}

      {activeTab === "failed" ? (
        <section>
          <div className="workspace-table-wrap overflow-x-auto">
            <table className="workspace-table min-w-[980px]">
              <thead><tr><th>Recipient</th><th>Phone</th><th>Status</th><th>Failure Code</th><th>Failure Reason</th><th>Attempts</th><th>Last Attempt</th></tr></thead>
              <tbody>
                {failedRecipientsPagination.visibleItems.map((recipient) => (
                  <tr key={recipient.id}>
                    <td>{recipient.name || "-"}</td>
                    <td>{recipient.normalizedPhone || recipient.phoneNormalized}</td>
                    <td>{recipient.sendStatus}</td>
                    <td>{recipient.failureCode || "-"}</td>
                    <td>{recipient.failureReason || recipient.errorMessage || "-"}</td>
                    <td>{recipient.attemptCount}</td>
                    <td>{formatDate(recipient.lastAttemptAt || recipient.failedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PanelPagination page={failedRecipientsPagination.page} pageCount={failedRecipientsPagination.pageCount} pageSize={failedRecipientsPagination.pageSize} totalItems={failedRecipientsPagination.totalItems} onPageChange={failedRecipientsPagination.setPage} />
        </section>
      ) : null}

      {activeTab === "settings" && settingsQuery.data ? (
        <section className="grid gap-3 md:grid-cols-2">
          <NumberSetting label="WhatsApp daily limit" value={settingsQuery.data.whatsapp_daily_limit} onSave={(value) => settingsMutation.mutate({ whatsapp_daily_limit: value })} />
          <NumberSetting label="Per account daily limit" value={settingsQuery.data.per_account_daily_limit} onSave={(value) => settingsMutation.mutate({ per_account_daily_limit: value })} />
          <NumberSetting label="Send rate per minute" value={settingsQuery.data.send_rate_per_minute} onSave={(value) => settingsMutation.mutate({ send_rate_per_minute: value })} />
          <NumberSetting label="Min delay seconds" value={settingsQuery.data.min_delay_seconds} onSave={(value) => settingsMutation.mutate({ min_delay_seconds: value })} />
          <ToggleSetting label="Auto-pause on high failure" checked={settingsQuery.data.auto_pause_enabled} onSave={(value) => settingsMutation.mutate({ auto_pause_enabled: value })} />
          <ToggleSetting label="Require opt-out text" checked={settingsQuery.data.require_opt_out_text} onSave={(value) => settingsMutation.mutate({ require_opt_out_text: value })} />
          <ToggleSetting label="Block critical spam risk" checked={settingsQuery.data.block_high_spam_risk} onSave={(value) => settingsMutation.mutate({ block_high_spam_risk: value })} />
        </section>
      ) : null}
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-sm text-text-muted">
          {items.map((item) => <li key={item}>{humanize(item)}</li>)}
        </ul>
      ) : <p className="mt-2 text-sm text-text-muted">None</p>}
    </div>
  );
}

function NumberSetting({ label, value, onSave }: { label: string; value: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <span className="workspace-label">{label}</span>
      <div className="mt-2 flex gap-2">
        <Input type="number" min={1} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <Button variant="secondary" onClick={() => onSave(Number(draft) || value)}>Save</Button>
      </div>
    </label>
  );
}

function ToggleSetting({ label, checked, onSave }: { label: string; checked: boolean; onSave: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm font-semibold text-text shadow-soft">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onSave(event.target.checked)} />
    </label>
  );
}
