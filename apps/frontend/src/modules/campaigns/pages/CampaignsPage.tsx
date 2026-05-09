import { Megaphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Toast } from "../../../components/Toast";
import { CampaignListTable } from "../components/CampaignListTable";
import { CampaignStatsCards } from "../components/CampaignStatsCards";
import { CreateCampaignDrawer } from "../components/CreateCampaignDrawer";
import { getMockCampaignStats, mockCampaigns } from "../services/campaignService";

export function CampaignsPage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const stats = useMemo(() => getMockCampaignStats(mockCampaigns), []);

  function showPlaceholderNotice(message: string) {
    setNotice({ message, variant: "success" });
  }

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
              <Megaphone size={18} />
            </p>
            <h2 className="mt-3 section-title">Campaigns</h2>
            <p className="mt-2 max-w-2xl section-copy">Create, manage and review WhatsApp customer campaigns.</p>
          </div>
          <Button onClick={() => setIsDrawerOpen(true)}>Create Campaign</Button>
        </div>
      </Card>

      <CampaignStatsCards stats={stats} />

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Campaign list</p>
          <p className="mt-2 text-sm text-text-muted">Mock campaign data for module scaffolding. Sending is not connected.</p>
        </div>
        <CampaignListTable campaigns={mockCampaigns} onAction={showPlaceholderNotice} />
      </Card>

      <CreateCampaignDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onPlaceholderAction={showPlaceholderNotice}
      />
      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} />
    </section>
  );
}
