import { Megaphone, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Input } from "../../../components/Input";
import { PanelPagination, usePanelPagination } from "../../../components/PanelPagination";
import { Toast } from "../../../components/Toast";
import { useWhatsAppAccounts } from "../../../hooks/useAdmin";
import { useRealtimeCampaigns } from "../../../hooks/useRealtimeCampaigns";
import type { DashboardOutletContext } from "../../../layouts/DashboardLayout";
import { fetchAudienceGroups } from "../audience-groups/services/audienceGroupService";
import { CampaignListTable } from "../components/CampaignListTable";
import { CampaignReviewDrawer } from "../components/CampaignReviewDrawer";
import { CampaignStatsCards } from "../components/CampaignStatsCards";
import { CreateCampaignDrawer } from "../components/CreateCampaignDrawer";
import { cancelCampaign, deleteCampaign, fetchCampaigns, getCampaignStats, pauseCampaign, resumeCampaign } from "../services/campaignService";
import type { Campaign, CampaignStatus } from "../types/campaign.types";

const campaignStatusFilters: Array<{ label: string; value: CampaignStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "Draft" },
  { label: "Scheduled", value: "Scheduled" },
  { label: "Sending", value: "Sending" },
  { label: "Failed", value: "Failed" },
  { label: "Completed", value: "Completed" }
];
const campaignListPageSize = 5;

export function CampaignsPage() {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const shouldFetchOrganizationData = !outletContext.isSuperAdmin || Boolean(organizationId);
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [reviewCampaign, setReviewCampaign] = useState<Campaign | null>(null);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");
  const [campaignQuery, setCampaignQuery] = useState("");
  useRealtimeCampaigns(organizationId);
  const { data: whatsappAccounts = [] } = useWhatsAppAccounts(organizationId, shouldFetchOrganizationData);
  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns", organizationId],
    queryFn: () => fetchCampaigns(organizationId),
    enabled: shouldFetchOrganizationData,
    refetchInterval: shouldFetchOrganizationData ? 3000 : false,
    refetchIntervalInBackground: false
  });
  const stats = useMemo(() => getCampaignStats(campaigns), [campaigns]);
  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = campaignQuery.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        campaign.name.toLowerCase().includes(normalizedQuery) ||
        campaign.audience.toLowerCase().includes(normalizedQuery) ||
        (campaign.audienceGroupName?.toLowerCase().includes(normalizedQuery) ?? false);

      return matchesStatus && matchesQuery;
    });
  }, [campaignQuery, campaigns, statusFilter]);
  const {
    page: campaignPage,
    pageCount: campaignPageCount,
    pageSize,
    totalItems,
    visibleItems: visibleCampaigns,
    setPage: setCampaignPage
  } = usePanelPagination(filteredCampaigns, campaignListPageSize);
  const { data: audienceGroups = [] } = useQuery({
    queryKey: ["audience-groups", organizationId],
    queryFn: () => fetchAudienceGroups(organizationId),
    enabled: shouldFetchOrganizationData
  });

  useEffect(() => {
    setCampaignPage(1);
  }, [campaignQuery, setCampaignPage, statusFilter]);

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

  const deleteMutation = useMutation({
    mutationFn: (campaign: Campaign) => deleteCampaign({ campaignId: campaign.id, organizationId }),
    onSuccess: async (result) => {
      showPlaceholderNotice(result.message, "success");
      await refreshCampaigns();
    },
    onError: (error) => showPlaceholderNotice(error instanceof Error ? error.message : "Unable to delete campaign.", "error")
  });

  function handleDeleteCampaign(campaign: Campaign) {
    const confirmed = window.confirm(
      `Delete "${campaign.name}" from the campaign list? This removes the campaign row and its recipient progress history.`
    );

    if (confirmed) {
      deleteMutation.mutate(campaign);
    }
  }

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 lg:items-end">
          <div className="min-w-0">
            <p className="hidden h-10 w-10 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary sm:inline-flex">
              <Megaphone size={18} />
            </p>
            <h2 className="section-title sm:mt-3">Campaigns</h2>
            <p className="mt-2 hidden max-w-2xl section-copy sm:block">Create, manage and review WhatsApp customer campaigns.</p>
          </div>
          <Button className="shrink-0 px-3 sm:px-5" onClick={() => setIsDrawerOpen(true)}>
            Create
            <span className="hidden sm:inline"> Campaign</span>
          </Button>
        </div>
      </Card>

      <CampaignStatsCards stats={stats} />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex min-h-[2.25rem] items-center border border-primary bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
            Campaigns
          </span>
          <Link className="inline-flex min-h-[2.25rem] items-center border border-border bg-white px-3 py-2 text-xs font-semibold text-text transition hover:bg-background-tint" to="/campaigns/audience-groups">
            Audience Groups
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {campaignStatusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`inline-flex min-h-[2.25rem] shrink-0 items-center border px-3 py-2 text-xs font-semibold transition ${
                statusFilter === filter.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-white text-text-muted hover:bg-background-tint hover:text-text"
              }`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="relative block sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={campaignQuery}
            onChange={(event) => setCampaignQuery(event.target.value)}
            placeholder="Search campaigns or audience"
            className="pl-9"
          />
        </label>
      </div>

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Campaign list</p>
            <p className="mt-2 text-sm text-text-muted">Live campaign progress from paced dispatch.</p>
          </div>
          <p className="shrink-0 text-xs font-semibold text-text-muted">{filteredCampaigns.length} shown</p>
        </div>
        <CampaignListTable
          campaigns={visibleCampaigns}
          onAction={showPlaceholderNotice}
          onReview={setReviewCampaign}
          onPause={(campaign) => pauseMutation.mutate(campaign)}
          onResume={(campaign) => resumeMutation.mutate(campaign)}
          onCancel={(campaign) => cancelMutation.mutate(campaign)}
          onDelete={handleDeleteCampaign}
        />
        <PanelPagination
          page={campaignPage}
          pageCount={campaignPageCount}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setCampaignPage}
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
      <CampaignReviewDrawer
        open={Boolean(reviewCampaign)}
        campaign={reviewCampaign}
        organizationId={organizationId}
        onClose={() => setReviewCampaign(null)}
        onNotice={showPlaceholderNotice}
      />
      <Toast message={notice?.message ?? null} variant={notice?.variant ?? "success"} onClose={() => setNotice(null)} />
    </section>
  );
}
