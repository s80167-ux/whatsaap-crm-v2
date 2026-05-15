import { Archive, FileCheck2, FileText, PencilLine } from "lucide-react";
import { Card } from "../../../../components/Card";
import type { TemplateStats } from "../types/template.types";

const statCards = [
  { key: "total", label: "Total Templates", icon: FileText },
  { key: "active", label: "Active", icon: FileCheck2 },
  { key: "draft", label: "Draft", icon: PencilLine },
  { key: "archived", label: "Archived", icon: Archive }
] as const;

export function TemplateStatsCards({ stats }: { stats: TemplateStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.key} elevated className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-text">{stats[card.key].toLocaleString()}</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center border border-primary/10 bg-primary/5 text-primary">
                <Icon size={18} />
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
