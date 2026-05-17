import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Mail, MessageCircle, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type ChannelSetupPlaceholderVariant = "social" | "ecommerce" | "email";

type SetupItem = {
  title: string;
  details: string[];
  inbox?: string;
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
    title: "Social Messenger Setup",
    description:
      "This page is prepared as a setup placeholder for Facebook Messenger, Instagram DM and TikTok DM. No connector, database migration, API sync or message ingestion has been enabled yet.",
    icon: MessageCircle,
    items: [
      {
        title: "Facebook Messenger",
        details: ["Future requirement: Meta App, Page access, webhook, page token"],
        inbox: "/inbox/social"
      },
      {
        title: "Instagram DM",
        details: ["Future requirement: Instagram Professional account linked to Facebook Page"],
        inbox: "/inbox/social"
      },
      {
        title: "TikTok DM",
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
        title: "Microsoft 365 / Corporate Email",
        details: ["Use case: company sender account", "Future requirement: secure auth / SMTP or OAuth flow"]
      },
      {
        title: "Gmail",
        details: ["Use case: small business sender account", "Future requirement: app password or OAuth flow"]
      },
      {
        title: "Custom SMTP",
        details: ["Use case: domain-based sender", "Future requirement: SMTP host, port, username, password, sender identity"]
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
              <h2 className="mt-2 text-xl font-semibold text-foreground">Prepared for future channel activation</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">Use this area to review planned setup requirements before the channel is connected.</p>
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
            <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
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
