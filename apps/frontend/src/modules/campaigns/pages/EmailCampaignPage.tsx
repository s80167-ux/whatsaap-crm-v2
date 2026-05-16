import { Mail, Sparkles } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { useCampaignEmailModuleStatus } from "../../../hooks/useAdmin";
import type { DashboardOutletContext } from "../../../layouts/DashboardLayout";
import { CampaignModuleTabs } from "../components/CampaignModuleTabs";

const overviewItems = [
  { label: "Email Blasts", value: "Coming Soon" },
  { label: "Scheduled", value: "Coming Soon" },
  { label: "Sent", value: "Coming Soon" },
  { label: "Opened / Clicked", value: "Coming Soon" }
];

export function EmailCampaignPage({ activeTab = "overview" }: { activeTab?: "overview" | "create" | "templates" | "audience" | "history" }) {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const emailModuleStatus = useCampaignEmailModuleStatus(null, !outletContext.isSuperAdmin);
  const isEmailEnabled = outletContext.isSuperAdmin ? true : emailModuleStatus.data?.isEnabled === true;

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 lg:items-end">
          <div className="min-w-0">
            <p className="hidden h-10 w-10 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary sm:inline-flex">
              <Mail size={18} />
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:mt-3">
              <h2 className="section-title">Email Campaign</h2>
              <span className="inline-flex min-h-[1.65rem] items-center border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                Coming Soon
              </span>
            </div>
            <p className="mt-2 hidden max-w-3xl section-copy sm:block">
              Email blast, email templates, audience segmentation, and email campaign history will be available in a future release.
            </p>
          </div>
          <Button className="shrink-0 px-3 sm:px-5" disabled>
            Create Email Campaign
          </Button>
        </div>
      </Card>

      <CampaignModuleTabs channel="email" />

      {outletContext.isSuperAdmin && !organizationId ? (
        <Card elevated className="p-5 text-sm text-text-muted">
          Choose an organization from the sidebar before reviewing Email campaign access.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewItems.map((item) => (
              <Card key={item.label} className="min-h-[86px] p-3 opacity-75 sm:min-h-[112px] sm:p-4" elevated>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft sm:text-[11px]">{item.label}</p>
                <p className="mt-2 text-sm font-semibold tracking-tight text-text sm:mt-3 sm:text-lg">{item.value}</p>
              </Card>
            ))}
          </div>

          {!isEmailEnabled ? (
            <Card elevated className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
                  <Sparkles size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Not Enabled</p>
                  <h3 className="mt-2 text-lg font-semibold text-text">Email campaign access is currently disabled</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                    This organization has not enabled the Email campaign placeholder module yet. Email sending will remain unavailable even when the module is enabled.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <PlaceholderCard
            title={getTabTitle(activeTab)}
            description={getTabDescription(activeTab)}
            disabledActionLabel={activeTab === "create" ? "Create Email Campaign" : undefined}
          />
        </>
      )}
    </section>
  );
}

function PlaceholderCard({ description, disabledActionLabel, title }: { description: string; disabledActionLabel?: string; title: string }) {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Coming Soon</p>
        <h3 className="mt-2 text-lg font-semibold text-text">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{description}</p>
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-background-tint px-5 py-6">
        <p className="text-sm font-semibold text-text">Email sending is not enabled yet.</p>
        <p className="mt-2 text-sm leading-6 text-text-muted">This tab follows the same campaign layout pattern, but every action remains placeholder-only until email infrastructure is introduced.</p>
        {disabledActionLabel ? <Button className="mt-4" size="sm" disabled>{disabledActionLabel}</Button> : null}
      </div>
    </Card>
  );
}

function getTabTitle(activeTab: "overview" | "create" | "templates" | "audience" | "history") {
  switch (activeTab) {
    case "create":
      return "Create Email";
    case "templates":
      return "Email Templates";
    case "audience":
      return "Email Audience";
    case "history":
      return "Email History";
    default:
      return "Email Overview";
  }
}

function getTabDescription(activeTab: "overview" | "create" | "templates" | "audience" | "history") {
  switch (activeTab) {
    case "create":
      return "Email sending is not enabled yet.";
    case "templates":
      return "Email templates are coming soon.";
    case "audience":
      return "Email audience segmentation is coming soon.";
    case "history":
      return "Email campaign history is coming soon.";
    default:
      return "Email blast, scheduling, audience segmentation, and reporting are being prepared for a future release.";
  }
}