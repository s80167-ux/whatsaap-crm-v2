import { Card } from "../../../components/Card";
import type { CampaignStats } from "../types/campaign.types";

export function CampaignStatsCards({ stats }: { stats: CampaignStats }) {
  const items = [
    { label: "Total", value: stats.total },
    { label: "Draft", value: stats.draft },
    { label: "Scheduled", value: stats.scheduled },
    { label: "Sent", value: stats.sent },
    { label: "Failed", value: stats.failed },
    { label: "Replied", value: stats.replied }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label} className="min-h-[86px] p-3 sm:min-h-[112px] sm:p-4" elevated>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft sm:text-[11px]">{item.label}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-text sm:mt-3 sm:text-2xl">{item.value.toLocaleString()}</p>
        </Card>
      ))}
    </div>
  );
}
