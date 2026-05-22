import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, Clock, Instagram, Mail, MessageCircle, PlugZap, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  logo?: "facebook" | "instagram" | "whatsapp" | "tiktok";
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
    logo: "whatsapp",
    note: "Live connector enabled"
  },
  {
    title: "Facebook Messenger",
    status: "Coming Soon",
    statusTone: "soon",
    description: "Facebook Messenger integration is on hold for now while platform restrictions are cleared.",
    actionLabel: "View coming soon",
    to: "/setup/channels/facebook",
    icon: MessageCircle,
    logo: "facebook",
    subItems: ["Meta review", "Page permission", "CRM Inbox"]
  },
  {
    title: "Instagram DM",
    status: "Coming Soon",
    statusTone: "soon",
    description: "Instagram DM integration is on hold for now while platform restrictions are cleared.",
    actionLabel: "View coming soon",
    to: "/setup/channels/instagram",
    icon: Instagram,
    logo: "instagram",
    subItems: ["Professional Account", "Linked Facebook Page", "Messaging permission"]
  },
  {
    title: "TikTok DM",
    status: "Coming Soon",
    statusTone: "soon",
    description: "Prepare TikTok Business/API access review for a future TikTok DM workflow.",
    actionLabel: "View setup placeholder",
    to: "/setup/channels/tiktok",
    icon: MessageCircle,
    logo: "tiktok",
    subItems: ["TikTok Business", "API access review"]
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
    description: "Prepare sender accounts for email campaign workflows using Gmail App Password or custom SMTP.",
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

function ChannelLogo({ channel, Icon }: { channel: ChannelCard; Icon: LucideIcon }) {
  if (channel.logo === "whatsapp") {
    return (
      <div className="channel-logo channel-logo--whatsapp flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background shadow-soft" aria-label="WhatsApp logo">
        <svg className="h-7 w-7" viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path
            fill="#25D366"
            d="M12.02 2.1a9.8 9.8 0 0 0-8.35 14.95L2.5 21.5l4.56-1.16A9.8 9.8 0 1 0 12.02 2.1Z"
          />
          <path
            fill="#fff"
            d="M17.77 14.52c-.24.68-1.19 1.24-1.92 1.4-.51.11-1.18.2-3.42-.73-2.87-1.19-4.72-4.1-4.86-4.29-.14-.19-1.16-1.55-1.16-2.96s.73-2.1.99-2.39c.24-.27.53-.34.7-.34h.5c.16.01.38-.06.6.45.24.58.8 1.99.87 2.13.07.15.11.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.14-.29.29-.12.58.16.29.72 1.19 1.55 1.93 1.07.96 1.96 1.26 2.25 1.4.29.15.46.13.63-.07.19-.22.72-.84.91-1.13.19-.29.39-.24.65-.15.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.72-.17 1.4Z"
          />
        </svg>
      </div>
    );
  }

  if (channel.logo === "facebook") {
    return (
      <div className="channel-logo channel-logo--facebook flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-soft" aria-label="Facebook logo">
        <svg className="h-7 w-7" viewBox="0 0 24 24" role="img" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4.5" fill="#1877F2" />
          <path
            fill="#fff"
            d="M13.62 20v-5.47h1.85l.28-2.14h-2.13V11.02c0-.62.17-1.04 1.06-1.04h1.13V8.07c-.2-.03-.86-.07-1.64-.07-1.62 0-2.73.99-2.73 2.81v1.57H9.6v2.14h1.84V20h2.18Z"
          />
        </svg>
      </div>
    );
  }

  if (channel.logo === "instagram") {
    return (
      <div className="channel-logo channel-logo--instagram flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-soft" aria-label="Instagram logo">
        <svg className="h-7 w-7" viewBox="0 0 24 24" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="instagram-channel-logo-gradient" x1="20.3" x2="3.7" y1="3.7" y2="20.3" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset="0.32" stopColor="#FA7E1E" />
              <stop offset="0.58" stopColor="#D62976" />
              <stop offset="0.82" stopColor="#962FBF" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#instagram-channel-logo-gradient)" />
          <circle cx="12" cy="12" r="4.1" fill="none" stroke="#fff" strokeWidth="1.9" />
          <circle cx="17.25" cy="6.75" r="1.15" fill="#fff" />
        </svg>
      </div>
    );
  }

  if (channel.logo === "tiktok") {
    return (
      <div className="channel-logo channel-logo--tiktok flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-soft" aria-label="TikTok logo">
        <svg className="h-7 w-7" viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path
            fill="#25F4EE"
            d="M14.3 3h2.25c.18 1.05.64 1.97 1.38 2.75.73.77 1.6 1.26 2.62 1.47v2.36a6.9 6.9 0 0 1-3.38-.92v5.8a5.3 5.3 0 1 1-5.3-5.3c.28 0 .55.02.82.07v2.7a2.68 2.68 0 1 0 1.61 2.46V3Z"
          />
          <path
            fill="#FE2C55"
            d="M13.35 3h2.25c.18 1.05.64 1.97 1.38 2.75.73.77 1.6 1.26 2.62 1.47v2.36a6.9 6.9 0 0 1-3.38-.92v5.8a5.3 5.3 0 1 1-5.3-5.3c.28 0 .55.02.82.07v2.7a2.68 2.68 0 1 0 1.61 2.46V3Z"
            opacity="0.72"
            transform="translate(-.95 .65)"
          />
          <path
            fill="#111827"
            d="M14 3h2.25c.18 1.05.64 1.97 1.38 2.75.73.77 1.6 1.26 2.62 1.47v2.36a6.9 6.9 0 0 1-3.38-.92v5.8a5.3 5.3 0 1 1-5.3-5.3c.28 0 .55.02.82.07v2.7A2.68 2.68 0 1 0 14 14.39V3Z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="channel-logo flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-soft">
      <Icon size={21} />
    </div>
  );
}

export function ChannelSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const channels: ChannelCard[] = [
    {
      title: t("channelSetup.channels.whatsapp.title"),
      status: t("channelSetup.status.active"),
      statusTone: "active",
      description: t("channelSetup.channels.whatsapp.description"),
      actionLabel: t("channelSetup.channels.whatsapp.action"),
      to: "/setup/channels/whatsapp",
      icon: PlugZap,
      logo: "whatsapp",
      note: t("channelSetup.channels.whatsapp.note")
    },
    {
      title: t("channelSetup.channels.facebook.title"),
      status: t("channelSetup.status.comingSoon"),
      statusTone: "soon",
      description: t("channelSetup.channels.facebook.description"),
      actionLabel: t("channelSetup.actions.viewComingSoon"),
      to: "/setup/channels/facebook",
      icon: MessageCircle,
      logo: "facebook",
      subItems: [t("channelSetup.channels.facebook.items.review"), t("channelSetup.channels.facebook.items.permission"), t("channelSetup.channels.facebook.items.inbox")]
    },
    {
      title: t("channelSetup.channels.instagram.title"),
      status: t("channelSetup.status.comingSoon"),
      statusTone: "soon",
      description: t("channelSetup.channels.instagram.description"),
      actionLabel: t("channelSetup.actions.viewComingSoon"),
      to: "/setup/channels/instagram",
      icon: Instagram,
      logo: "instagram",
      subItems: [t("channelSetup.channels.instagram.items.account"), t("channelSetup.channels.instagram.items.page"), t("channelSetup.channels.instagram.items.permission")]
    },
    {
      title: t("channelSetup.channels.tiktok.title"),
      status: t("channelSetup.status.comingSoon"),
      statusTone: "soon",
      description: t("channelSetup.channels.tiktok.description"),
      actionLabel: t("channelSetup.actions.viewPlaceholder"),
      to: "/setup/channels/tiktok",
      icon: MessageCircle,
      logo: "tiktok",
      subItems: [t("channelSetup.channels.tiktok.items.business"), t("channelSetup.channels.tiktok.items.review")]
    },
    {
      title: t("channelSetup.channels.marketplace.title"),
      status: t("channelSetup.status.comingSoon"),
      statusTone: "soon",
      description: t("channelSetup.channels.marketplace.description"),
      actionLabel: t("channelSetup.actions.viewPlaceholder"),
      to: "/setup/channels/ecommerce",
      icon: ShoppingBag,
      subItems: [t("channelSetup.channels.marketplace.items.shopee"), t("channelSetup.channels.marketplace.items.lazada")]
    },
    {
      title: t("channelSetup.channels.email.title"),
      status: t("channelSetup.status.ready"),
      statusTone: "ready",
      description: t("channelSetup.channels.email.description"),
      actionLabel: t("channelSetup.channels.email.action"),
      to: "/setup/channels/email",
      icon: Mail,
      note: t("channelSetup.channels.email.note")
    }
  ];

  return (
    <section className="space-y-6">
      <div className="workspace-page-header p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),18rem] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{t("channelSetup.badge")}</p>
            <h1 className="mt-3 section-title">{t("channelSetup.title")}</h1>
            <p className="section-copy mt-2 max-w-3xl">
              {t("channelSetup.description")}
            </p>
          </div>
          <div className="workspace-subtle p-4">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles size={16} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">{t("channelSetup.controlCenter")}</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">{t("channelSetup.summary")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {channels.map((channel) => {
          const Icon = channel.icon;

          return (
            <Card key={channel.title} elevated className="channel-card flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ChannelLogo channel={channel} Icon={Icon} />
                  <div className="min-w-0">
                    <h2 className="channel-card-title text-lg font-semibold text-foreground">{channel.title}</h2>
                    <p className="channel-card-note mt-1 text-xs font-medium text-text-soft">{channel.note ?? t("channelSetup.connectorNotEnabled")}</p>
                  </div>
                </div>
                <span className={`channel-status inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClasses[channel.statusTone]}`}>
                  {channel.statusTone === "active" ? <CheckCircle size={12} /> : <Clock size={12} />}
                  {channel.status}
                </span>
              </div>

              <p className="channel-card-description mt-5 flex-1 text-sm leading-6 text-text-muted">{channel.description}</p>

              {channel.subItems ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {channel.subItems.map((item) => (
                    <span key={item} className="channel-chip border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-text-muted">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button className="channel-action w-full sm:w-auto" onClick={() => navigate(channel.to)}>
                  {channel.actionLabel}
                  <ArrowRight size={16} />
                </Button>
                {channel.title === "Email" ? (
                  <Link className="channel-link text-xs font-semibold text-primary hover:text-primary-hover" to="/campaigns/email/sender-setup">
                    {t("channelSetup.emailSenderSetup")}
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
