import { Link, useLocation } from "react-router-dom";
import { FileText, ListPlus, Megaphone } from "lucide-react";

const campaignModuleTabs = [
  { label: "Campaigns", to: "/campaigns", icon: Megaphone, end: true },
  { label: "Audience Groups", to: "/campaigns/audience-groups", icon: ListPlus, end: true },
  { label: "Message Templates", to: "/campaigns/templates", icon: FileText, end: false }
];

export function CampaignModuleTabs() {
  const location = useLocation();

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Campaign module navigation">
      {campaignModuleTabs.map((tab) => {
        const isActive = tab.end ? location.pathname === tab.to : location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`);
        const Icon = tab.icon;

        if (isActive) {
          return (
            <span
              key={tab.to}
              className="inline-flex min-h-[2.25rem] items-center gap-2 border border-primary bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"
            >
              <Icon size={14} />
              {tab.label}
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
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
