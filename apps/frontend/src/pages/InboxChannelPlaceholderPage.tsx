import { motion } from "framer-motion";
import { MessageCircle, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { Card } from "../components/Card";
import { InboxSubTabs } from "../components/InboxSubTabs";
import { SocialChannelHeaderBlock, type SocialChannelBrand } from "../components/SocialChannelBrand";

type InboxPlaceholderVariant = "social" | "facebook" | "instagram" | "ecommerce";

type ChannelPreview = {
  label: string;
  description: string;
};

const PLACEHOLDER_CONTENT: Record<InboxPlaceholderVariant, {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  icon: LucideIcon;
  channels: ChannelPreview[];
  roadmap: string[];
}> = {
  social: {
    eyebrow: "Social Messenger",
    title: "Social Messenger Coming Soon",
    description:
      "Facebook Messenger, Instagram DM and TikTok inboxes are on hold for now. This area stays visible as a coming soon placeholder until social connector restrictions are cleared.",
    badge: "Coming Soon",
    icon: MessageCircle,
    channels: [
      { label: "Facebook Messenger", description: "Customer enquiries from business pages and campaign replies." },
      { label: "Instagram DM", description: "DM follow-up from posts, reels, ads and profile visits." },
      { label: "TikTok DM", description: "Lightweight queue for TikTok lead conversations and content-driven enquiries." }
    ],
    roadmap: [
      "Connect official social messaging account",
      "Map external profile to CRM contact",
      "Show message thread in unified inbox",
      "Route unread conversations to sales owner"
    ]
  },
  facebook: {
    eyebrow: "Facebook Messenger",
    title: "Facebook Messenger Coming Soon",
    description:
      "Facebook Messenger inbox integration is currently on hold due to platform restrictions. No Facebook messages, replies or sync jobs are enabled from this page.",
    badge: "Coming Soon",
    icon: MessageCircle,
    channels: [
      { label: "Facebook Messenger", description: "Future Page Messenger conversations and campaign replies." }
    ],
    roadmap: [
      "Complete Meta app and permission review",
      "Connect approved Facebook Page",
      "Map Page customer profile to CRM contact",
      "Enable focused Facebook inbox queue"
    ]
  },
  instagram: {
    eyebrow: "Instagram DM",
    title: "Instagram DM Coming Soon",
    description:
      "Instagram DM inbox integration is currently on hold due to platform restrictions. No Instagram messages, replies or sync jobs are enabled from this page.",
    badge: "Coming Soon",
    icon: MessageCircle,
    channels: [
      { label: "Instagram DM", description: "Future DM follow-up from posts, reels, ads and profile visits." }
    ],
    roadmap: [
      "Complete Meta app and Instagram permission review",
      "Confirm Instagram Professional account linkage",
      "Map Instagram profile to CRM contact",
      "Enable focused Instagram DM queue"
    ]
  },
  ecommerce: {
    eyebrow: "E-commerce DM",
    title: "Shopee & Lazada inbox placeholder",
    description:
      "Centralize marketplace buyer conversations, order-related questions and follow-up messages without mixing them with normal WhatsApp chats.",
    badge: "Marketplace connector planned",
    icon: ShoppingBag,
    channels: [
      { label: "Shopee Chat", description: "Buyer enquiries, fulfilment questions and product follow-ups." },
      { label: "Lazada Chat", description: "Marketplace DM queue for order support and post-sale response." }
    ],
    roadmap: [
      "Connect marketplace seller account",
      "Map buyer identity to CRM contact",
      "Link conversation to order context where available",
      "Track response queue separately from WhatsApp"
    ]
  }
};

export function InboxChannelPlaceholderPage({ variant }: { variant: InboxPlaceholderVariant }) {
  const content = PLACEHOLDER_CONTENT[variant];
  const Icon = content.icon;
  const headerBrand: SocialChannelBrand | undefined = variant === "facebook" ? "facebook" : variant === "instagram" ? "instagram" : undefined;

  return (
    <section className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card elevated className="workspace-page-header p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <SocialChannelHeaderBlock
              channel={headerBrand}
              eyebrow="Inbox"
              title={content.title}
              description={content.description}
            />
            <InboxSubTabs
              tabs={[
                { to: "/inbox", label: "All Inbox" },
                { to: "/inbox/whatsapp", label: "WhatsApp" },
                { to: "/inbox/facebook", label: "FB Messenger (Soon)" },
                { to: "/inbox/instagram", label: "IG Messenger (Soon)" },
                { to: "/inbox/ecommerce", label: "E-commerce" },
                { to: "/inbox/replies", label: "Template Library" }
              ]}
            />
          </div>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
        <Card elevated className="overflow-hidden p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles size={14} />
                {content.badge}
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-soft">
                  <Icon size={22} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{content.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
                    This page is prepared as a product placeholder only. No connector, database migration, API sync or message ingestion has been enabled yet.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {content.channels.map((channel) => (
                  <div key={channel.label} className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-sm font-semibold text-foreground">{channel.label}</p>
                    <p className="mt-1 text-xs leading-5 text-text-muted">{channel.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-border bg-background/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Future flow</p>
              <div className="mt-4 space-y-3">
                {content.roadmap.map((item, index) => (
                  <div key={item} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <p className="pt-0.5 text-sm leading-5 text-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}
