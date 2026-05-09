import { Card } from "../../../components/Card";
import type { CampaignStats } from "../types/campaign.types";

export function CampaignStatsCards({ stats }: { stats: CampaignStats }) {
  const items = [
    { label: "Total Campaigns", value: stats.total },
    { label: "Draft", value: stats.draft },
    { label: "Scheduled", value: stats.scheduled },
    { label: "Sent", value: stats.sent },
    { label: "Failed", value: stats.failed },
    { label: "Replied", value: stats.replied }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label} className="min-h-[112px] p-4" elevated>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">{item.label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{item.value.toLocaleString()}</p>
        </Card>
      ))}
    </div>
  );
}
