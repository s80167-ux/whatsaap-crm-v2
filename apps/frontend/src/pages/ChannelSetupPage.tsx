import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, Clock, Mail, MessageCircle, PlugZap, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type ChannelCard = {
  title: string;
  status: string;
  statusTone: "active" | "soon" | "ready";
  description: string;
  actionLabel: string;
  to: string;
  icon: LucideIcon;
  note?: string;
  subItems?: string[];
};

const CHANNELS: ChannelCard[] = [
  {
    title: "WhatsApp",
    status: "Active",
    statusTone: "active",
    description: "Manage paired WhatsApp accounts, QR connection, reconnect, contact sync and history sync.",
    actionLabel: "Manage WhatsApp",
    to: "/setup/channels/whatsapp",
    icon: PlugZap,
    note: "Live connector enabled"
  },
  {
    title: "Social Messenger",
    status: "Coming Soon",
    statusTone: "soon",
    description: "Prepare Facebook Messenger, Instagram DM and TikTok DM for future unified inbox integration.",
    actionLabel: "View setup placeholder",
    to: "/setup/channels/social",
    icon: MessageCircle,
    subItems: ["Facebook Messenger", "Instagram DM", "TikTok DM"]
  },
  {
    title: "Marketplace DM",
    status: "Coming Soon",
    statusTone: "soon",
    description: "Prepare Shopee and Lazada buyer messages for future marketplace conversation workflows.",
    actionLabel: "View setup placeholder",
    to: "/setup/channels/ecommerce",
    icon: ShoppingBag,
    subItems: ["Shopee Chat", "Lazada Chat"]
  },
  {
    title: "Email",
    status: "Campaign Ready / Setup Required",
    statusTone: "ready",
    description: "Prepare sender accounts for email campaign workflows using Microsoft 365, Gmail or custom SMTP.",
    actionLabel: "Open Email Setup",
    to: "/setup/channels/email",
    icon: Mail,
    note: "Campaign sender setup available"
  }
];

const statusClasses: Record<ChannelCard["statusTone"], string> = {
  active: "border-success/20 bg-success/10 text-success",
  soon: "border-border bg-muted/40 text-text-muted",
  ready: "border-primary/20 bg-primary/10 text-primary"
};

export function ChannelSetupPage() {
  const navigate = useNavigate();

  return (
    <section className="space-y-6">
      <div className="workspace-page-header p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),18rem] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Omni-Channel Setup</p>
            <h1 className="mt-3 section-title">Channel Setup</h1>
            <p className="section-copy mt-2 max-w-3xl">
              Connect and prepare customer conversation channels for WhatsApp, social messenger, marketplace DM and email workflows.
            </p>
          </div>
          <div className="workspace-subtle p-4">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles size={16} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Control centre</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">Only WhatsApp is active today. Other channel pages are setup placeholders.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;

          return (
            <Card key={channel.title} elevated className="flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-soft">
                    <Icon size={21} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground">{channel.title}</h2>
                    <p className="mt-1 text-xs font-medium text-text-soft">{channel.note ?? "Connector not enabled yet"}</p>
                  </div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClasses[channel.statusTone]}`}>
                  {channel.statusTone === "active" ? <CheckCircle size={12} /> : <Clock size={12} />}
                  {channel.status}
                </span>
              </div>

              <p className="mt-5 flex-1 text-sm leading-6 text-text-muted">{channel.description}</p>

              {channel.subItems ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {channel.subItems.map((item) => (
                    <span key={item} className="border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-text-muted">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button className="w-full sm:w-auto" onClick={() => navigate(channel.to)}>
                  {channel.actionLabel}
                  <ArrowRight size={16} />
                </Button>
                {channel.title === "Email" ? (
                  <Link className="text-xs font-semibold text-primary hover:text-primary-hover" to="/campaigns/email/sender-setup">
                    Campaign sender setup
                  </Link>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
