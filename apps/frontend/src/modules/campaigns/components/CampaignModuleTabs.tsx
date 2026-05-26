import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileCheck2, FileText, History, ListPlus, Mail, Megaphone, PlusCircle, Settings, ShieldCheck, UserX, WalletCards } from "lucide-react";

const campaignModuleTabs = {
  whatsapp: [
    { labelKey: "campaign.audience", to: "/campaigns/whatsapp/audience", icon: ListPlus, end: false },
    { labelKey: "campaign.templates", to: "/campaigns/whatsapp/templates", icon: FileText, end: false, excludeActivePaths: ["/campaigns/whatsapp/templates/governance"] },
    { labelKey: "campaign.governance", to: "/campaigns/whatsapp/templates/governance", icon: ShieldCheck, end: true },
    { labelKey: "campaign.setup", to: "/campaigns/whatsapp/create", icon: PlusCircle, end: true },
    { labelKey: "campaign.safety", to: "/campaigns/whatsapp/safety", icon: ShieldCheck, end: true },
    { labelKey: "campaign.launchMonitor", to: "/campaigns/whatsapp", icon: Megaphone, end: true },
    { labelKey: "campaign.history", to: "/campaigns/whatsapp/history", icon: History, end: true }
  ],
  email: [
    { labelKey: "nav.campaigns", to: "/campaigns/email", icon: Mail, end: true, activePaths: ["/campaigns/email", "/campaigns/email/create"] },
    { labelKey: "campaign.templates", to: "/campaigns/email/templates", icon: FileText, end: true },
    { labelKey: "campaign.audience", to: "/campaigns/email/audience", icon: ListPlus, end: true },
    { labelKey: "campaign.senders", to: "/campaigns/email/sender-setup", icon: WalletCards, end: true },
    { labelKey: "nav.reports", to: "/campaigns/email/reports", icon: FileCheck2, end: true },
    { labelKey: "nav.settings", to: "/campaigns/email/compliance", icon: Settings, end: true, activePaths: ["/campaigns/email/compliance", "/campaigns/email/suppression-list", "/campaigns/email/history"] }
  ]
} as const;

const emailSettingsTabs = [
  { labelKey: "campaign.suppressionList", to: "/campaigns/email/suppression-list", icon: UserX, end: true },
  { labelKey: "campaign.compliance", to: "/campaigns/email/compliance", icon: ShieldCheck, end: true },
  { labelKey: "campaign.history", to: "/campaigns/email/history", icon: History, end: true }
] as const;

export function CampaignModuleTabs({ channel }: { channel: "whatsapp" | "email" }) {
  const { t } = useTranslation();
  const location = useLocation();
  const tabs = campaignModuleTabs[channel];

  const settingsActive = channel === "email" && emailSettingsTabs.some((tab) => location.pathname === tab.to);

  return (
    <nav className="space-y-2" aria-label="Campaign module navigation">
      <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const activePaths = "activePaths" in tab ? [...tab.activePaths] : [tab.to];
        const excludeActivePaths = "excludeActivePaths" in tab ? [...tab.excludeActivePaths] : [];
        const isExcluded = excludeActivePaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
        const isActive =
          !isExcluded &&
          (activePaths.some((path) => location.pathname === path) || (!tab.end && location.pathname.startsWith(`${tab.to}/`)));
        const Icon = tab.icon;

        if (isActive) {
          return (
            <span
              key={tab.to}
              className="inline-flex min-h-[2.25rem] items-center gap-2 border border-primary bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"
            >
              <Icon size={14} />
              {t(tab.labelKey)}
            </span>
          );
        }

        return (
          <Link
            key={tab.to}
            className="inline-flex min-h-[2.25rem] items-center gap-2 border border-border bg-card px-3 py-2 text-xs font-semibold text-text transition hover:bg-background-tint"
            to={tab.to}
          >
            <Icon size={14} />
            {t(tab.labelKey)}
          </Link>
        );
      })}
      </div>
      {settingsActive ? (
        <div data-guide="email-settings" className="flex flex-wrap gap-2 border border-border bg-background-tint p-2">
          {emailSettingsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.to;

            return isActive ? (
              <span key={tab.to} className="inline-flex min-h-[2rem] items-center gap-2 border border-primary bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
                <Icon size={14} />
                {t(tab.labelKey)}
              </span>
            ) : (
              <Link key={tab.to} className="inline-flex min-h-[2rem] items-center gap-2 border border-border bg-card px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-background-tint" to={tab.to}>
                <Icon size={14} />
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
