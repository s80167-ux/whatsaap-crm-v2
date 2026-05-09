import clsx from "clsx";
import type { CampaignStatus } from "../types/campaign.types";

const statusClasses: Record<CampaignStatus, string> = {
  Draft: "border-slate-200 bg-slate-100 text-slate-600",
  Scheduled: "border-amber-200 bg-amber-50 text-amber-700",
  Sending: "border-blue-200 bg-blue-50 text-blue-700",
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Failed: "border-coral/20 bg-coral/10 text-coral"
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClasses[status])}>
      {status}
    </span>
  );
}
