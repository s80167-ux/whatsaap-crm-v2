import { Link, useLocation } from "react-router-dom";
import { FileCheck2, FileText, History, ListPlus, Mail, Megaphone, PlusCircle, ShieldCheck, UserX, WalletCards } from "lucide-react";

const campaignModuleTabs = {
  whatsapp: [
    { label: "Overview", to: "/campaigns/whatsapp", icon: Megaphone, end: true },
    { label: "Create Broadcast", to: "/campaigns/whatsapp/create", icon: PlusCircle, end: true },
    { label: "Templates", to: "/campaigns/whatsapp/templates", icon: FileText, end: false },
    { label: "Governance", to: "/campaigns/whatsapp/templates/governance", icon: ShieldCheck, end: true },
    { label: "Safety", to: "/campaigns/whatsapp/safety", icon: ShieldCheck, end: true },
    { label: "Audience", to: "/campaigns/whatsapp/audience", icon: ListPlus, end: false },
    { label: "History", to: "/campaigns/whatsapp/history", icon: History, end: true }
  ],
  email: [
    { label: "Overview", to: "/campaigns/email", icon: Mail, end: true },
    { label: "Create Email", to: "/campaigns/email/create", icon: PlusCircle, end: true },
    { label: "Templates", to: "/campaigns/email/templates", icon: FileText, end: true },
    { label: "Audience", to: "/campaigns/email/audience", icon: ListPlus, end: true },
    { label: "Sender Setup", to: "/campaigns/email/sender-setup", icon: WalletCards, end: true },
    { label: "Suppression List", to: "/campaigns/email/suppression-list", icon: UserX, end: true },
    { label: "Compliance", to: "/campaigns/email/compliance", icon: ShieldCheck, end: true },
    { label: "Reports", to: "/campaigns/email/reports", icon: FileCheck2, end: true },
    { label: "History", to: "/campaigns/email/history", icon: History, end: true }
  ]
} as const;

export function CampaignModuleTabs({ channel }: { channel: "whatsapp" | "email" }) {
  const location = useLocation();
  const tabs = campaignModuleTabs[channel];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Campaign module navigation">
      {tabs.map((tab) => {
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
