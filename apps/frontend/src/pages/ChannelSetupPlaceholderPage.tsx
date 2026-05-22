import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Mail, MessageCircle, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type ChannelSetupPlaceholderVariant = "social" | "facebook" | "instagram" | "tiktok" | "ecommerce" | "email";

type SetupItem = {
  title: string;
  details: string[];
  inbox?: string;
  logo?: "facebook" | "instagram" | "tiktok";
};

type PlaceholderContent = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items: SetupItem[];
  roadmap?: string[];
  primaryAction?: {
    label: string;
    to: string;
  };
};

const CONTENT: Record<ChannelSetupPlaceholderVariant, PlaceholderContent> = {
  social: {
    eyebrow: "Social Messenger",
    title: "Social Messenger Coming Soon",
    description:
      "Facebook Messenger, Instagram DM and TikTok setup are on hold for now. No connector, database migration, API sync or message ingestion has been enabled yet.",
    icon: MessageCircle,
    items: [
      {
        title: "Facebook Messenger",
        logo: "facebook",
        details: ["Future requirement: Meta App, Page access, webhook, page token"],
        inbox: "/inbox/facebook"
      },
      {
        title: "Instagram DM",
        logo: "instagram",
        details: ["Future requirement: Instagram Professional account linked to Facebook Page"],
        inbox: "/inbox/instagram"
      },
      {
        title: "TikTok DM",
        logo: "tiktok",
        details: ["Future requirement: TikTok Business/API access review"],
        inbox: "/inbox/social"
      }
    ],
    roadmap: [
      "Connect official social account",
      "Map external profile to CRM contact",
      "Show message thread in unified inbox",
      "Route unread conversations to sales owner"
    ]
  },
  facebook: {
    eyebrow: "Facebook Messenger",
    title: "Facebook Messenger Coming Soon",
    description:
      "Facebook Messenger setup is currently on hold due to platform restrictions. OAuth, Page connection, webhook subscription and inbox sync are not enabled from this page.",
    icon: MessageCircle,
    items: [
      {
        title: "Facebook Messenger",
        logo: "facebook",
        details: ["On hold: Meta App review, Page access, webhook subscription and Page token activation"],
        inbox: "/inbox/facebook"
      }
    ],
    roadmap: [
      "Clear Meta app and permission restrictions",
      "Reconnect approved Facebook Page",
      "Enable webhook subscription",
      "Show Messenger conversations in CRM Inbox"
    ]
  },
  instagram: {
    eyebrow: "Instagram DM",
    title: "Instagram DM Coming Soon",
    description:
      "Instagram DM setup is currently on hold due to platform restrictions. Account connection, token exchange, webhook ingestion and inbox sync are not enabled from this page.",
    icon: MessageCircle,
    items: [
      {
        title: "Instagram DM",
        logo: "instagram",
        details: ["On hold: Instagram Professional account, linked Facebook Page and messaging permission"],
        inbox: "/inbox/instagram"
      }
    ],
    roadmap: [
      "Clear Meta app and Instagram messaging restrictions",
      "Confirm Professional account and Page linkage",
      "Enable webhook ingestion",
      "Show Instagram DMs in CRM Inbox"
    ]
  },
  tiktok: {
    eyebrow: "TikTok DM",
    title: "TikTok DM Setup",
    description:
      "This page is prepared as a setup placeholder for TikTok DM. No connector, database migration, API sync or message ingestion has been enabled yet.",
    icon: MessageCircle,
    items: [
      {
        title: "TikTok DM",
        logo: "tiktok",
        details: ["Future requirement: TikTok Business/API access review"],
        inbox: "/inbox/social"
      }
    ],
    roadmap: [
      "Confirm TikTok Business/API access",
      "Review official messaging permissions",
      "Map external profile to CRM contact",
      "Show message thread in unified inbox"
    ]
  },
  ecommerce: {
    eyebrow: "Marketplace DM",
    title: "Marketplace DM Setup",
    description:
      "This page is prepared as a setup placeholder for Shopee and Lazada buyer messages. No connector, database migration, API sync or message ingestion has been enabled yet.",
    icon: ShoppingBag,
    items: [
      {
        title: "Shopee Chat",
        details: ["Future requirement: Seller account/API access"],
        inbox: "/inbox/ecommerce"
      },
      {
        title: "Lazada Chat",
        details: ["Future requirement: Seller Center/API access"],
        inbox: "/inbox/ecommerce"
      }
    ],
    roadmap: [
      "Connect marketplace seller account",
      "Map buyer identity to CRM contact",
      "Link conversation to order context where available",
      "Track response queue separately from WhatsApp"
    ]
  },
  email: {
    eyebrow: "Email",
    title: "Email Setup",
    description: "This page is prepared as a setup placeholder for email sender configuration and campaign delivery readiness.",
    icon: Mail,
    items: [
      {
        title: "Gmail App Password",
        details: ["Use case: small business sender account", "Requirement: Gmail address and app password"]
      },
      {
        title: "Custom SMTP",
        details: ["Use case: domain-based sender", "Requirement: SMTP host, port, username, password, sender identity"]
      },
      {
        title: "Compliance",
        details: ["Unsubscribe requirement", "Suppression list", "Sender reputation"]
      }
    ],
    primaryAction: {
      label: "Go to Email Sender Setup",
      to: "/campaigns/email/sender-setup"
    }
  }
};

function ChannelLogo({ logo, title }: { logo?: SetupItem["logo"]; title: string }) {
  if (!logo) {
    return null;
  }

  const baseClassName = "h-6 w-6";

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background shadow-soft" aria-label={`${title} logo`}>
      {logo === "facebook" ? (
        <svg className={baseClassName} viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path
            fill="#0866FF"
            d="M12 2C6.477 2 2 6.158 2 11.287c0 2.92 1.452 5.526 3.722 7.23V22l3.398-1.866c.907.251 1.873.386 2.88.386 5.523 0 10-4.158 10-9.287S17.523 2 12 2Z"
          />
          <path fill="#fff" d="m7.996 13.947 2.937-3.113 2.282 2.424 3.789-4.013-2.937 5.038-2.282-2.424-3.789 2.088Z" />
        </svg>
      ) : null}
      {logo === "instagram" ? (
        <svg className={baseClassName} viewBox="0 0 24 24" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="instagramLogoGradient" x1="4" x2="20" y1="20" y2="4" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FEDA75" />
              <stop offset="0.35" stopColor="#FA7E1E" />
              <stop offset="0.65" stopColor="#D62976" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect width="20" height="20" x="2" y="2" rx="5.4" fill="url(#instagramLogoGradient)" />
          <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="17.2" cy="6.8" r="1.25" fill="#fff" />
        </svg>
      ) : null}
      {logo === "tiktok" ? (
        <svg className={baseClassName} viewBox="0 0 24 24" role="img" aria-hidden="true">
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
      ) : null}
    </span>
  );
}

export function ChannelSetupPlaceholderPage({ variant }: { variant: ChannelSetupPlaceholderVariant }) {
  const content = CONTENT[variant];
  const Icon = content.icon;
  const navigate = useNavigate();
  const primaryAction = content.primaryAction;

  return (
    <section className="space-y-6">
      <div className="workspace-page-header p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),19rem] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Omni-Channel Setup</p>
            <h1 className="mt-3 section-title">{content.title}</h1>
            <p className="section-copy mt-2 max-w-3xl">{content.description}</p>
          </div>
          <div className="workspace-subtle p-4">
            <div className="flex items-center gap-2 text-primary">
              <Clock size={16} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Placeholder only</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">No API calls or connector setup are enabled from this page.</p>
          </div>
        </div>
      </div>

      <Card elevated className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-soft">
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{content.eyebrow}</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">Coming soon</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">This channel is visible for planning only while setup and inbox activation remain paused.</p>
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Sparkles size={14} />
            Coming Soon
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {content.items.map((item) => (
          <Card key={item.title} elevated className="p-5">
            <div className="flex items-center gap-3">
              <ChannelLogo logo={item.logo} title={item.title} />
              <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
            </div>
            <div className="mt-4 space-y-2">
              {item.details.map((detail) => (
                <p key={detail} className="text-sm leading-6 text-text-muted">{detail}</p>
              ))}
              {item.inbox ? (
                <p className="text-sm leading-6 text-text-muted">
                  Future inbox: <Link className="font-semibold text-primary hover:text-primary-hover" to={item.inbox}>{item.inbox}</Link>
                </p>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {content.roadmap ? (
        <Card elevated className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Roadmap</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {content.roadmap.map((step, index) => (
              <div key={step} className="flex gap-3 border border-border bg-background/70 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm leading-5 text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {primaryAction ? (
          <Button className="w-full sm:w-auto" onClick={() => navigate(primaryAction.to)}>
            {primaryAction.label}
            <ArrowRight size={16} />
          </Button>
        ) : null}
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => navigate("/setup/channels")}>Back to Channels</Button>
      </div>
    </section>
  );
}
