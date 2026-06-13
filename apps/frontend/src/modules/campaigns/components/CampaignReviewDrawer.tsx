import { Download, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { PanelPagination } from "../../../components/PanelPagination";
import { PopupOverlay } from "../../../components/PopupOverlay";
import { downloadCampaignRecipients, fetchCampaignRecipients, fetchCampaignWarmupAdvisory, resumeCampaign, retryFailedCampaign } from "../services/campaignService";
import type { Campaign, CampaignRecipient, CampaignRecipientSendStatus, CampaignWarmupAdvisory } from "../types/campaign.types";
import { formatCampaignTempoSummary } from "../utils/campaignTempo";

const pageSize = 50;
const statusOptions: Array<{ label: string; value: CampaignRecipientSendStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Queued", value: "queued" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
  { label: "Skipped", value: "skipped" }
];

export function CampaignReviewDrawer({
  campaign,
  open,
  organizationId,
  onClose,
  onNotice
}: {
  campaign: Campaign | null;
  open: boolean;
  organizationId?: string | null;
  onClose: () => void;
  onNotice: (message: string, variant?: "success" | "error") => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CampaignRecipientSendStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus("all");
      setQuery("");
      setPage(1);
    }
  }, [open, campaign?.id]);

  useEffect(() => {
    setPage(1);
  }, [status, query]);

  const recipientsQuery = useQuery({
    queryKey: ["campaign-recipients", campaign?.id, organizationId, status, query, page],
    queryFn: () =>
      fetchCampaignRecipients({
        campaignId: campaign?.id ?? "",
        organizationId,
        status,
        q: query,
        page,
        limit: pageSize
      }),
    enabled: open && Boolean(campaign?.id),
    refetchInterval: open && campaign?.status === "Sending" ? 3000 : false,
    refetchIntervalInBackground: false
  });
  const warmupQuery = useQuery({
    queryKey: ["campaign-warmup-advisory", campaign?.id, organizationId],
    queryFn: () =>
      fetchCampaignWarmupAdvisory({
        campaignId: campaign?.id ?? "",
        organizationId
      }),
    enabled: open && Boolean(campaign?.id),
    refetchInterval: open && campaign?.status === "Sending" ? 3000 : false,
    refetchIntervalInBackground: false
  });

  const recipients = recipientsQuery.data?.data ?? [];
  const warmupAdvisories = warmupQuery.data ?? [];
  const total = recipientsQuery.data?.pagination.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const tempoSummary = useMemo(
    () => campaign ? formatCampaignTempoSummary(campaign, campaign.senderWhatsAppAccountIds?.length ?? (campaign.senderWhatsAppAccountId ? 1 : 0)) : "",
    [campaign]
  );
  const successRate = useMemo(() => {
    const completed = campaign ? campaign.sent + campaign.failed + (campaign.skipped ?? 0) : 0;
    return completed > 0 && campaign ? Math.round((campaign.sent / completed) * 100) : 0;
  }, [campaign]);
  const senderStatusSummary = useMemo(() => {
    if (warmupAdvisories.length === 0) {
      return campaign?.pauseReason ?? "No sender status available.";
    }

    return warmupAdvisories
      .map((advisory) => `${advisory.senderLabel || advisory.senderPhoneNumber || "Sender"}: ${advisory.connectionStatus}`)
      .join(" | ");
  }, [campaign?.pauseReason, warmupAdvisories]);

  const resumeMutation = useMutation({
    mutationFn: () => resumeCampaign({ campaignId: campaign?.id ?? "", organizationId }),
    onSuccess: async (result) => {
      onNotice(result.message, "success");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-recipients", campaign?.id] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-warmup-advisory", campaign?.id, organizationId] })
      ]);
    },
    onError: (error) => onNotice(error instanceof Error ? error.message : "Unable to resume campaign.", "error")
  });

  const retryFailedMutation = useMutation({
    mutationFn: () =>
      retryFailedCampaign({
        campaignId: campaign?.id ?? "",
        organizationId,
        failureCodes: ["sender_banned", "sender_suspected_ban", "sender_logged_out", "sender_disconnected", "sender_unavailable", "suspected_sender_issue"]
      }),
    onSuccess: async (result) => {
      onNotice(result.message, "success");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-recipients", campaign?.id] })
      ]);
    },
    onError: (error) => onNotice(error instanceof Error ? error.message : "Unable to retry failed recipients.", "error")
  });
  const retryAllFailedMutation = useMutation({
    mutationFn: () =>
      retryFailedCampaign({
        campaignId: campaign?.id ?? "",
        organizationId
      }),
    onSuccess: async (result) => {
      onNotice(result.message, "success");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-recipients", campaign?.id] })
      ]);
    },
    onError: (error) => onNotice(error instanceof Error ? error.message : "Unable to retry all failed recipients.", "error")
  });

  async function handleDownload() {
    if (!campaign) {
      return;
    }

    setIsDownloading(true);

    try {
      await downloadCampaignRecipients({
        campaignId: campaign.id,
        campaignName: campaign.name,
        organizationId,
        status,
        q: query
      });
      onNotice("Campaign recipient export downloaded.", "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to download campaign recipients.", "error");
    } finally {
      setIsDownloading(false);
    }
  }

  const canRetryFailed = Boolean(campaign) && (campaign.status === "Paused" || campaign.status === "Failed");
  const hasSenderIssueFailures = (campaign?.failedSenderIssue ?? 0) > 0;
  const hasAnyFailedRecipients = (campaign?.failed ?? 0) > 0;

  return (
    <PopupOverlay
      open={open}
      onClose={onClose}
      title={campaign ? campaign.name : "Campaign review"}
      description="Recipient-level delivery progress from the uploaded contact list."
      panelClassName="max-w-6xl"
    >
      {campaign ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <Metric label="Recipients" value={campaign.recipients} />
            <Metric label="Pending" value={campaign.pending ?? 0} />
            <Metric label="Queued" value={campaign.queued ?? 0} />
            <Metric label="Sent" value={campaign.sent} />
            <Metric label="Sender Issue Failed" value={campaign.failedSenderIssue ?? 0} tone="danger" />
            <Metric label="Other Failed" value={campaign.failedOther ?? Math.max(campaign.failed - (campaign.failedSenderIssue ?? 0), 0)} tone="danger" />
            <Metric label="Skipped" value={campaign.skipped ?? 0} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label="Success" value={`${successRate}%`} />
            <Metric label="Current Sender Status" value={warmupAdvisories[0]?.connectionStatus ?? "unknown"} />
            <Metric label="Campaign Status" value={campaign.status} />
          </div>

          <div className="rounded-2xl border border-border bg-muted px-4 py-4 text-sm text-text">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Effective Sending Plan</p>
            <p className="mt-2 leading-6 text-text-muted">{tempoSummary}</p>
          </div>

          {canRetryFailed ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Recovery State</p>
              <p className="mt-2 leading-6 text-amber-900">
                {campaign.pauseReason || "Campaign paused because the sender appears to be unavailable. This may be caused by disconnection, logout, session issue, or possible ban."}
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-900">
                Resume will continue pending recipients only. Sent recipients will not be resent. Failed recipients will remain failed unless you choose Retry Failed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/campaigns/whatsapp/create?edit=${encodeURIComponent(campaign.id)}`)}>
                  Replace Sender
                </Button>
                <Button
                  size="sm"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                >
                  Resume Pending Only
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => retryFailedMutation.mutate()}
                  disabled={retryFailedMutation.isPending || retryAllFailedMutation.isPending || !hasSenderIssueFailures}
                >
                  Retry Failed Sender Issues
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => retryAllFailedMutation.mutate()}
                  disabled={retryFailedMutation.isPending || retryAllFailedMutation.isPending || !hasAnyFailedRecipients}
                >
                  Retry All Failed
                </Button>
              </div>
            </div>
          ) : null}

          {warmupAdvisories.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Sender Warm-up</p>
              <p className="mt-2 leading-6 text-amber-900">
                Warm-up is advisory only. Sending continues, and this panel shows which sender is still ramping up.
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-900">{senderStatusSummary}</p>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {warmupAdvisories.map((advisory) => (
                  <WarmupCard key={advisory.whatsappAccountId} advisory={advisory} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={clsx(
                    "inline-flex min-h-[2.25rem] shrink-0 items-center border px-3 py-2 text-xs font-semibold transition",
                    status === option.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-text-muted hover:bg-muted hover:text-text"
                  )}
                  onClick={() => setStatus(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, tag, error"
                  className="pl-9"
                />
              </label>
              <Button className="w-full sm:w-auto" variant="secondary" onClick={handleDownload} disabled={isDownloading}>
                <Download size={16} />
                {isDownloading ? "Preparing" : "Download Excel"}
              </Button>
            </div>
          </div>

          <div className="space-y-3 xl:hidden">
            {recipientsQuery.isLoading ? (
              <div className="workspace-empty-state px-4 py-6 text-sm text-text-muted">Loading recipients...</div>
            ) : recipients.length > 0 ? (
              recipients.map((recipient) => <RecipientCard key={recipient.id} recipient={recipient} />)
            ) : (
              <div className="workspace-empty-state px-4 py-6 text-sm text-text-muted">No recipients match this view.</div>
            )}
          </div>

          <div className="workspace-table-wrap hidden xl:block">
            <table className="workspace-table workspace-table-compact">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Tag</th>
                  <th>Location</th>
                  <th>Sent At</th>
                  <th>Failed At</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {recipientsQuery.isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-sm text-text-muted">Loading recipients...</td>
                  </tr>
                ) : recipients.length > 0 ? (
                  recipients.map((recipient) => <RecipientRow key={recipient.id} recipient={recipient} />)
                ) : (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-sm text-text-muted">No recipients match this view.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PanelPagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            totalItems={total}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </PopupOverlay>
  );
}

function WarmupCard({ advisory }: { advisory: CampaignWarmupAdvisory }) {
  const label = advisory.senderLabel || advisory.senderPhoneNumber || "Sender";
  const tone = advisory.isAboveSuggestedLimit
    ? "border-amber-300 bg-white/80 text-amber-950"
    : "border-emerald-200 bg-white/80 text-emerald-950";

  return (
    <div className={clsx("rounded-2xl border px-4 py-3", tone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-current/75">
            {advisory.senderPhoneNumber || "No phone shown"} · {advisory.connectionStatus}
          </p>
        </div>
        <span className="inline-flex min-h-[1.75rem] items-center border border-current/15 px-2 text-xs font-semibold">
          Warm-up L{advisory.warmupLevel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Detail label="Sent today" value={advisory.sentToday.toLocaleString()} />
        <Detail label="Suggested cap" value={advisory.suggestedDailyLimit.toLocaleString()} />
        <Detail label="Campaign cap" value={advisory.baseDailyLimit.toLocaleString()} />
        <Detail label="Warm-up start" value={formatDateTime(advisory.warmupStartedAt)} />
      </div>

      <p className="mt-3 text-xs leading-5">
        {advisory.isAboveSuggestedLimit
          ? `Above suggested warm-up pace by ${advisory.exceededBy.toLocaleString()} messages today.`
          : "Within the suggested warm-up pace today."}
      </p>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-muted px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted sm:text-xs sm:tracking-[0.14em]">{label}</p>
      <p className={clsx("mt-2 text-lg font-semibold sm:text-xl", tone === "danger" ? "text-coral" : "text-text")}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function RecipientCard({ recipient }: { recipient: CampaignRecipient }) {
  return (
    <article className="app-card p-3 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">{recipient.name || "Unnamed contact"}</h3>
          <p className="mt-1 text-xs text-text-muted">{recipient.phoneNormalized}</p>
        </div>
        <StatusPill status={recipient.sendStatus} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Detail label="Attempts" value={recipient.attemptCount.toLocaleString()} />
        <Detail label="Tag" value={recipient.tag || "-"} />
        <Detail label="Location" value={recipient.location || "-"} />
        <Detail label={recipient.failedAt ? "Failed At" : "Sent At"} value={formatDateTime(recipient.failedAt || recipient.sentAt)} />
      </div>

      {recipient.errorMessage ? (
        <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive">Error</p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-destructive">{recipient.errorMessage}</p>
        </div>
      ) : null}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-soft">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-text">{value}</p>
    </div>
  );
}

function RecipientRow({ recipient }: { recipient: CampaignRecipient }) {
  return (
    <tr className="table-row">
      <td className="font-semibold text-text">{recipient.name || "Unnamed contact"}</td>
      <td className="text-text-muted">{recipient.phoneNormalized}</td>
      <td><StatusPill status={recipient.sendStatus} /></td>
      <td>{recipient.attemptCount}</td>
      <td className="text-text-muted">{recipient.tag || "-"}</td>
      <td className="text-text-muted">{recipient.location || "-"}</td>
      <td className="text-text-muted">{formatDateTime(recipient.sentAt)}</td>
      <td className="text-text-muted">{formatDateTime(recipient.failedAt)}</td>
      <td className="max-w-xs truncate text-text-muted" title={recipient.errorMessage ?? undefined}>
        {recipient.errorMessage || "-"}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: CampaignRecipientSendStatus }) {
  const classes: Record<CampaignRecipientSendStatus, string> = {
    pending: "border-border bg-muted text-text-muted",
    queued: "border-warning/20 bg-warning/10 text-warning",
    sending: "border-primary/20 bg-primary/10 text-primary",
    sent: "border-success/20 bg-success/10 text-success",
    failed: "border-destructive/30 bg-destructive/10 text-destructive",
    skipped: "border-border bg-card text-text-soft",
    opted_out: "border-amber-200 bg-amber-50 text-amber-900"
  };

  return (
    <span className={clsx("inline-flex min-h-[1.75rem] items-center border px-2 text-xs font-semibold capitalize", classes[status])}>
      {status}
    </span>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
