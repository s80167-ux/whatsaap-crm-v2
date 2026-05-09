import { Download, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { PanelPagination } from "../../../components/PanelPagination";
import { PopupOverlay } from "../../../components/PopupOverlay";
import { downloadCampaignRecipients, fetchCampaignRecipients } from "../services/campaignService";
import type { Campaign, CampaignRecipient, CampaignRecipientSendStatus } from "../types/campaign.types";

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

  const recipients = recipientsQuery.data?.data ?? [];
  const total = recipientsQuery.data?.pagination.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const successRate = useMemo(() => {
    const completed = campaign ? campaign.sent + campaign.failed + (campaign.skipped ?? 0) : 0;
    return completed > 0 && campaign ? Math.round((campaign.sent / completed) * 100) : 0;
  }, [campaign]);

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
            <Metric label="Failed" value={campaign.failed} tone="danger" />
            <Metric label="Skipped" value={campaign.skipped ?? 0} />
            <Metric label="Success" value={`${successRate}%`} />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={clsx(
                    "inline-flex min-h-[2.25rem] shrink-0 items-center border px-3 py-2 text-xs font-semibold transition",
                    status === option.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-white text-text-muted hover:bg-background-tint hover:text-text"
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

          <div className="space-y-3 sm:hidden">
            {recipientsQuery.isLoading ? (
              <div className="workspace-empty-state px-4 py-6 text-sm text-text-muted">Loading recipients...</div>
            ) : recipients.length > 0 ? (
              recipients.map((recipient) => <RecipientCard key={recipient.id} recipient={recipient} />)
            ) : (
              <div className="workspace-empty-state px-4 py-6 text-sm text-text-muted">No recipients match this view.</div>
            )}
          </div>

          <div className="workspace-table-wrap hidden sm:block">
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

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "danger" }) {
  return (
    <div className="border border-border bg-background-tint px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted sm:text-xs sm:tracking-[0.14em]">{label}</p>
      <p className={clsx("mt-2 text-lg font-semibold sm:text-xl", tone === "danger" ? "text-coral" : "text-text")}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function RecipientCard({ recipient }: { recipient: CampaignRecipient }) {
  return (
    <article className="border border-border bg-white p-3 shadow-soft">
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
        <div className="mt-3 border border-coral/20 bg-coral/10 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-coral">Error</p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-coral">{recipient.errorMessage}</p>
        </div>
      ) : null}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-background-tint px-2 py-2">
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
    pending: "border-border bg-background-tint text-text-muted",
    queued: "border-amber-200 bg-amber-50 text-amber-700",
    sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
    failed: "border-coral/30 bg-coral/10 text-coral",
    skipped: "border-slate-200 bg-slate-50 text-slate-600"
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
