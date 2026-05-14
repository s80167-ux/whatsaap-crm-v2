import { Trash2 } from "lucide-react";
import { Button } from "../../../components/Button";
import type { Campaign } from "../types/campaign.types";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

export function CampaignListTable({
  campaigns,
  onAction,
  onReview,
  onPause,
  onResume,
  onCancel,
  onDelete
}: {
  campaigns: Campaign[];
  onAction: (message: string) => void;
  onReview?: (campaign: Campaign) => void;
  onPause?: (campaign: Campaign) => void;
  onResume?: (campaign: Campaign) => void;
  onCancel?: (campaign: Campaign) => void;
  onDelete?: (campaign: Campaign) => void;
}) {
  if (campaigns.length === 0) {
    return (
      <div className="workspace-empty-state px-4 py-8">
        <p className="text-sm font-semibold text-text">No campaigns found</p>
        <p className="mt-1 text-sm text-text-muted">Try a different status or search term.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {campaigns.map((campaign) => (
          <CampaignMobileCard
            key={campaign.id}
            campaign={campaign}
            onAction={onAction}
            onReview={onReview}
            onPause={onPause}
            onResume={onResume}
            onCancel={onCancel}
            onDelete={onDelete}
          />
        ))}
      </div>

      <div className="workspace-table-wrap hidden sm:block">
        <table className="workspace-table workspace-table-compact">
          <thead>
            <tr>
              <th>Campaign Name</th>
              <th>Audience</th>
              <th>Status</th>
              <th>Recipients</th>
              <th>Sent</th>
              <th>Failed</th>
              <th>Replied</th>
              <th>Created At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="table-row">
                <td className="font-semibold text-text">{campaign.name}</td>
                <td className="text-text-muted">{campaign.audience}</td>
                <td><CampaignStatusBadge status={campaign.status} /></td>
                <td>{campaign.recipients.toLocaleString()}</td>
                <td>{campaign.sent.toLocaleString()}</td>
                <td>{campaign.failed.toLocaleString()}</td>
                <td>{campaign.replied.toLocaleString()}</td>
                <td>{campaign.createdAt}</td>
                <td>
                  <CampaignActions
                    campaign={campaign}
                    onAction={onAction}
                    onReview={onReview}
                    onPause={onPause}
                    onResume={onResume}
                    onCancel={onCancel}
                    onDelete={onDelete}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CampaignMobileCard({
  campaign,
  onAction,
  onReview,
  onPause,
  onResume,
  onCancel,
  onDelete
}: {
  campaign: Campaign;
  onAction: (message: string) => void;
  onReview?: (campaign: Campaign) => void;
  onPause?: (campaign: Campaign) => void;
  onResume?: (campaign: Campaign) => void;
  onCancel?: (campaign: Campaign) => void;
  onDelete?: (campaign: Campaign) => void;
}) {
  const completed = campaign.sent + campaign.failed + (campaign.skipped ?? 0);
  const progress = campaign.recipients > 0 ? Math.min(100, Math.round((completed / campaign.recipients) * 100)) : 0;

  return (
    <article className="app-card p-3 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">{campaign.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{campaign.audience}</p>
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{completed.toLocaleString()} of {campaign.recipients.toLocaleString()}</span>
          <span>{progress}%</span>
        </div>
        <progress
          className="campaign-progress mt-2"
          value={progress}
          max={100}
          aria-label={`Campaign progress for ${campaign.name}`}
        >
          {progress}%
        </progress>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric label="Sent" value={campaign.sent} />
        <Metric label="Failed" value={campaign.failed} danger />
        <Metric label="Replied" value={campaign.replied} />
      </div>

      <p className="mt-3 text-xs text-text-muted">Created {campaign.createdAt}</p>
      <CampaignActions
        campaign={campaign}
        onAction={onAction}
        onReview={onReview}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onDelete={onDelete}
        mobile
      />
    </article>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-soft">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${danger ? "text-coral" : "text-text"}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function CampaignActions({
  campaign,
  onAction,
  onReview,
  onPause,
  onResume,
  onCancel,
  onDelete,
  mobile = false
}: {
  campaign: Campaign;
  onAction: (message: string) => void;
  onReview?: (campaign: Campaign) => void;
  onPause?: (campaign: Campaign) => void;
  onResume?: (campaign: Campaign) => void;
  onCancel?: (campaign: Campaign) => void;
  onDelete?: (campaign: Campaign) => void;
  mobile?: boolean;
}) {
  return (
    <div className={mobile ? "mt-3 grid grid-cols-2 gap-2" : "flex flex-wrap gap-2"}>
      <Button
        size="sm"
        variant={mobile ? "primary" : "ghost"}
        className={mobile ? "col-span-2 w-full" : undefined}
        onClick={() => (onReview ? onReview(campaign) : onAction("Campaign progress is shown in the table."))}
      >
        Review
      </Button>
      {campaign.status === "Sending" && onPause ? (
        <Button size="sm" variant="secondary" onClick={() => onPause(campaign)}>
          Pause
        </Button>
      ) : null}
      {campaign.status === "Paused" && onResume ? (
        <Button size="sm" variant="secondary" onClick={() => onResume(campaign)}>
          Resume
        </Button>
      ) : null}
      {["Draft", "Scheduled", "Sending", "Paused", "Failed"].includes(campaign.status) && onCancel ? (
        <Button size="sm" variant="ghost" onClick={() => onCancel(campaign)}>
          Cancel
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          size={mobile ? "sm" : "icon"}
          variant="ghost"
          className={`border border-border bg-card text-coral hover:bg-muted hover:text-coral ${mobile ? "col-span-2 w-full" : ""}`}
          aria-label={`Delete ${campaign.name}`}
          title={`Delete ${campaign.name}`}
          onClick={() => onDelete(campaign)}
        >
          {mobile ? "Delete" : <Trash2 size={16} />}
        </Button>
      ) : null}
    </div>
  );
}
