import clsx from "clsx";
import type { CampaignStatus } from "../types/campaign.types";

const statusClasses: Record<CampaignStatus, string> = {
  Draft: "border-border bg-muted text-text-muted",
  Scheduled: "border-warning/20 bg-warning/10 text-warning",
  Sending: "border-primary/20 bg-primary/10 text-primary",
  Paused: "border-secondary/25 bg-secondary/55 text-secondary-foreground",
  Completed: "border-success/20 bg-success/10 text-success",
  Failed: "border-destructive/20 bg-destructive/10 text-destructive",
  Cancelled: "border-border bg-card text-text-soft"
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClasses[status])}>
      {status}
    </span>
  );
}
