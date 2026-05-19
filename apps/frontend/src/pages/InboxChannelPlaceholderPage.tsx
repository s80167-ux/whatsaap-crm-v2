import { motion } from "framer-motion";
import { MessageCircle, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { Card } from "../components/Card";
import { InboxSubTabs } from "../components/InboxSubTabs";

type InboxPlaceholderVariant = "social" | "ecommerce";

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
    title: "Facebook, Instagram & TikTok inbox placeholder",
    description:
      "Bring customer messages from Facebook Messenger, Instagram DM and TikTok into the same CRM workspace once connector integration is ready.",
    badge: "Connector planned",
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

  return (
    <section className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card elevated className="workspace-page-header p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Inbox</p>
              <h1 className="mt-2 section-title">{content.eyebrow}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">{content.description}</p>
            </div>
            <InboxSubTabs
              tabs={[
                { to: "/inbox", label: "All Inbox" },
                { to: "/inbox/whatsapp", label: "WhatsApp" },
                { to: "/inbox/facebook", label: "FB Messenger" },
                { to: "/inbox/instagram", label: "IG Messenger" },
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
