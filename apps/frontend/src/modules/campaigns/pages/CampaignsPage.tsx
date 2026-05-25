import { Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
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
import { CampaignModuleTabs } from "../components/CampaignModuleTabs";
import { CampaignReviewDrawer } from "../components/CampaignReviewDrawer";
import { CampaignStatsCards } from "../components/CampaignStatsCards";
import { CreateCampaignDrawer } from "../components/CreateCampaignDrawer";
import { cancelCampaign, deleteCampaign, fetchCampaigns, getCampaignStats, pauseCampaign, resumeCampaign, startCampaign } from "../services/campaignService";
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

export function CampaignsPage({ activeTab = "overview" }: { activeTab?: "overview" | "create" | "history" }) {
  const { t } = useTranslation();
  const outletContext = useOutletContext<DashboardOutletContext>();
  const navigate = useNavigate();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const shouldFetchOrganizationData = !outletContext.isSuperAdmin || Boolean(organizationId);
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(activeTab === "create");
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

  useEffect(() => {
    setIsDrawerOpen(activeTab === "create");
  }, [activeTab]);

  function showPlaceholderNotice(message: string, variant: "success" | "error" = "success") {
    setNotice({ message, variant });
  }

  async function refreshCampaigns() {
    await queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] });
  }

  const startMutation = useMutation({
    mutationFn: (campaign: Campaign) =>
      startCampaign({
        campaignId: campaign.id,
        organizationId,
        ...(campaign.senderWhatsAppAccountId ? { senderWhatsAppAccountId: campaign.senderWhatsAppAccountId } : {}),
        ...(campaign.audienceGroupId ? { audienceGroupId: campaign.audienceGroupId } : {}),
        ...(campaign.messageTemplate ? { messageTemplate: campaign.messageTemplate } : {}),
        ...(campaign.speedPreset ? { speedPreset: campaign.speedPreset } : {})
      }),
    onSuccess: async (result) => {
      showPlaceholderNotice(result.message, "success");
      await refreshCampaigns();
    },
    onError: (error) => showPlaceholderNotice(error instanceof Error ? error.message : "Unable to start campaign.", "error")
  });

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

  function handleStartCampaign(campaign: Campaign) {
    const confirmed = window.confirm(`Start campaign "${campaign.name}" now?`);

    if (confirmed) {
      startMutation.mutate(campaign);
    }
  }

  function handleDeleteCampaign(campaign: Campaign) {
    const confirmed = window.confirm(
      `Delete "${campaign.name}" from the campaign list? This removes the campaign row and its recipient progress history.`
    );

    if (confirmed) {
      deleteMutation.mutate(campaign);
    }
  }

  const audienceCount = useMemo(
    () => audienceGroups.reduce((total, group) => total + group.valid_count, 0),
    [audienceGroups]
  );
  const recentCampaigns = filteredCampaigns.slice(0, 3);

  function handleCloseDrawer() {
    setIsDrawerOpen(false);
    if (activeTab === "create") {
      navigate("/campaigns/whatsapp", { replace: true });
    }
  }

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{t("nav.campaigns")}</p>
            <h2 className="mt-3 section-title">{t("campaign.whatsapp.title")}</h2>
            <p className="mt-2 max-w-2xl section-copy">
              Manage WhatsApp broadcasts, templates, audiences, and campaign history.
            </p>
          </div>
          <Button className="shrink-0 px-3 sm:px-5" onClick={() => navigate("/campaigns/whatsapp/create")}>
            {t("campaign.create")}
          </Button>
        </div>
      </Card>

      <CampaignModuleTabs channel="whatsapp" />

      {outletContext.isSuperAdmin && !organizationId ? (
        <Card elevated className="p-5 text-sm text-text-muted">
          Choose an organization from the sidebar before managing WhatsApp campaigns.
        </Card>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
            <CampaignStatsCards stats={stats} />
            <Card elevated className="min-h-[86px] p-3 sm:min-h-[112px] sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft sm:text-[11px]">Audience Count</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-text sm:mt-3 sm:text-2xl">{audienceCount.toLocaleString()}</p>
            </Card>
          </div>

          {activeTab === "overview" ? (
            <Card elevated className="space-y-4 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Overview</p>
                  <p className="mt-2 text-sm text-text-muted">Recent broadcast activity and quick links for the WhatsApp campaign workflow.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate("/campaigns/whatsapp/history")}>
                  View History
                </Button>
              </div>

              {recentCampaigns.length > 0 ? (
                <CampaignListTable
                  campaigns={recentCampaigns}
                  onAction={showPlaceholderNotice}
                  onReview={setReviewCampaign}
                  onStart={handleStartCampaign}
                  onPause={(campaign) => pauseMutation.mutate(campaign)}
                  onResume={(campaign) => resumeMutation.mutate(campaign)}
                  onCancel={(campaign) => cancelMutation.mutate(campaign)}
                  onDelete={handleDeleteCampaign}
                />
              ) : (
                <CampaignEmptyStateCard
                  title="No broadcasts yet"
                  description="Create your first WhatsApp broadcast to start pacing outbound campaign delivery."
                  actionLabel="Create Broadcast"
                  onAction={() => navigate("/campaigns/whatsapp/create")}
                />
              )}
            </Card>
          ) : null}

          {activeTab === "create" ? (
            <Card elevated className="space-y-4 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Create Broadcast</p>
                  <p className="mt-2 text-sm text-text-muted">Use the existing broadcast drawer to compose, preview, and schedule a WhatsApp campaign.</p>
                </div>
                <Button size="sm" onClick={() => setIsDrawerOpen(true)}>Open Composer</Button>
              </div>
              <CampaignEmptyStateCard
                title="Broadcast composer ready"
                description="The existing broadcast drawer opens automatically on this tab. Audience groups and templates remain under their own page tabs so the flow stays familiar."
                secondaryAction={
                  <Link className="text-sm font-semibold text-primary hover:text-primary-dark" to="/campaigns/whatsapp/audience">
                    Manage Audience
                  </Link>
                }
              />
            </Card>
          ) : null}

          {activeTab === "history" ? (
            <>
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  {campaignStatusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={`inline-flex min-h-[2.25rem] shrink-0 items-center border px-3 py-2 text-xs font-semibold transition ${
                        statusFilter === filter.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-card text-text-muted hover:bg-background-tint hover:text-text"
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
                    placeholder={t("campaign.searchPlaceholder")}
                    className="pl-9"
                  />
                </label>
              </div>

              <Card elevated className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Campaign history</p>
                    <p className="mt-2 text-sm text-text-muted">Live campaign progress from paced dispatch.</p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-text-muted">{t("campaign.shown", { count: filteredCampaigns.length })}</p>
                </div>
                <CampaignListTable
                  campaigns={visibleCampaigns}
                  onAction={showPlaceholderNotice}
                  onReview={setReviewCampaign}
                  onStart={handleStartCampaign}
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
            </>
          ) : null}
        </>
      )}

      <CreateCampaignDrawer
        open={isDrawerOpen}
        onClose={handleCloseDrawer}
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

function CampaignEmptyStateCard({
  actionLabel,
  description,
  onAction,
  secondaryAction,
  title
}: {
  actionLabel?: string;
  description: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-background-tint px-5 py-6">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {actionLabel && onAction ? <Button size="sm" onClick={onAction}>{actionLabel}</Button> : null}
        {secondaryAction}
      </div>
    </div>
  );
}