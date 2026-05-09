import { Megaphone } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Toast } from "../../../components/Toast";
import { useWhatsAppAccounts } from "../../../hooks/useAdmin";
import type { DashboardOutletContext } from "../../../layouts/DashboardLayout";
import { fetchAudienceGroups } from "../audience-groups/services/audienceGroupService";
import { CampaignListTable } from "../components/CampaignListTable";
import { CampaignStatsCards } from "../components/CampaignStatsCards";
import { CreateCampaignDrawer } from "../components/CreateCampaignDrawer";
import { cancelCampaign, fetchCampaigns, getCampaignStats, pauseCampaign, resumeCampaign } from "../services/campaignService";
import type { Campaign } from "../types/campaign.types";

export function CampaignsPage() {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const shouldFetchOrganizationData = !outletContext.isSuperAdmin || Boolean(organizationId);
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const { data: whatsappAccounts = [] } = useWhatsAppAccounts(organizationId, shouldFetchOrganizationData);
  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns", organizationId],
    queryFn: () => fetchCampaigns(organizationId),
    enabled: shouldFetchOrganizationData
  });
  const stats = useMemo(() => getCampaignStats(campaigns), [campaigns]);
  const { data: audienceGroups = [] } = useQuery({
    queryKey: ["audience-groups", organizationId],
    queryFn: () => fetchAudienceGroups(organizationId),
    enabled: shouldFetchOrganizationData
  });

  function showPlaceholderNotice(message: string, variant: "success" | "error" = "success") {
    setNotice({ message, variant });
  }

  async function refreshCampaigns() {
    await queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] });
  }

  const pauseMutation = useMutation({
    mutationFn: (campaign: Campaign) => pauseCampaign({ campaignId: campaign.id, organizationId }),
    onSuccess: async (result) => {
      showPlaceholderNotice(result.message, "success");
      await refreshCampaigns();
    },
    onError: (error) => showPlaceholderNotice(error instanceof Error ? error.message : "Unable to pause campaign.", "error")
  });

  const resumeMutation = useMutation({
    mutationFn: (campaign: Campaign) => resumeCampaign({ campaignId: campaign.id, organizationId }),
    onSuccess: async (result) => {
      showPlaceholderNotice(result.message, "success");
      await refreshCampaigns();
    },
    onError: (error) => showPlaceholderNotice(error instanceof Error ? error.message : "Unable to resume campaign.", "error")
  });

  const cancelMutation = useMutation({
    mutationFn: (campaign: Campaign) => cancelCampaign({ campaignId: campaign.id, organizationId }),
    onSuccess: async (result) => {
      showPlaceholderNotice(result.message, "success");
      await refreshCampaigns();
    },
    onError: (error) => showPlaceholderNotice(error instanceof Error ? error.message : "Unable to cancel campaign.", "error")
  });

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

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex min-h-[2.25rem] items-center border border-primary bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
          Campaigns
        </span>
        <Link className="inline-flex min-h-[2.25rem] items-center border border-border bg-white px-3 py-2 text-xs font-semibold text-text transition hover:bg-background-tint" to="/campaigns/audience-groups">
          Audience Groups
        </Link>
      </div>

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Campaign list</p>
          <p className="mt-2 text-sm text-text-muted">Live campaign progress from paced dispatch.</p>
        </div>
        <CampaignListTable
          campaigns={campaigns}
          onAction={showPlaceholderNotice}
          onPause={(campaign) => pauseMutation.mutate(campaign)}
          onResume={(campaign) => resumeMutation.mutate(campaign)}
          onCancel={(campaign) => cancelMutation.mutate(campaign)}
        />
      </Card>

      <CreateCampaignDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onPlaceholderAction={showPlaceholderNotice}
        whatsappAccounts={whatsappAccounts}
        audienceGroups={audienceGroups}
        organizationId={organizationId}
        onCampaignChanged={() => void refreshCampaigns()}
      />
      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} />
    </section>
  );
}
