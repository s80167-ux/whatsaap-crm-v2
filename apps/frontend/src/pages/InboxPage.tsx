import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { ArrowDownAZ, ChevronLeft, Clock3, Info, Search } from "lucide-react";
import { Button } from "../components/Button";
import { ChatPanel } from "../components/ChatPanel";
import { Card } from "../components/Card";
import { ContactInfoPanel } from "../components/ContactInfoPanel";
import { ConversationList } from "../components/ConversationList";
import { InboxSubTabs } from "../components/InboxSubTabs";
import { PopupOverlay } from "../components/PopupOverlay";
import { useConversations } from "../hooks/useConversations";
import { useIsMobileViewport } from "../hooks/useMediaQuery";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeInbox } from "../hooks/useRealtimeInbox";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { DEFAULT_CHAT_HISTORY_RANGE, getHistoryRangeLabel } from "../lib/historyRange";
import { getStoredUser } from "../lib/auth";
import type { Conversation } from "../types/api";

type ConversationSortMode = "alphabetical" | "latest";
type MobileInboxPane = "list" | "chat";
type ConversationFilterMode = "mine" | "unread" | "unassigned" | "sales" | "all";

export function InboxPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobileViewport();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const activeOrganizationId = isSuperAdmin ? dashboardContext.selectedOrganizationId || null : currentUser?.organizationId ?? null;

  const chatHistoryRange = DEFAULT_CHAT_HISTORY_RANGE;
  const [conversationSortMode, setConversationSortMode] = useState<ConversationSortMode>("latest");
  const {
    data: conversations = [],
    error: conversationsError,
    isError: conversationsIsError,
    isLoading
  } = useConversations(
    chatHistoryRange,
    isSuperAdmin ? activeOrganizationId : undefined,
    true,
    { refetchIntervalMs: 2500 }
  );
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const [mobilePane, setMobilePane] = useState<MobileInboxPane>("list");
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const currentOrganizationUserId = currentUser?.organizationUserId ?? null;
  const [filterMode, setFilterMode] = useState<ConversationFilterMode>(currentOrganizationUserId ? "mine" : "all");
  const queueCounts = useMemo(
    () => ({
      all: conversations.length,
      unread: conversations.filter((conversation) => conversation.unread_count > 0).length,
      mine: currentOrganizationUserId
        ? conversations.filter((conversation) => conversation.assigned_user_id === currentOrganizationUserId).length
        : 0,
      unassigned: conversations.filter((conversation) => !conversation.assigned_user_id).length,
      sales: conversations.filter((conversation) => Boolean(conversation.has_sales || conversation.has_sales_lead_tag)).length
    }),
    [conversations, currentOrganizationUserId]
  );
  const visibleConversations = useMemo(
    () =>
      conversations
        .filter((conversation) => {
          const normalizedSearch = searchText.trim().toLowerCase();
          const matchesSearch =
            !normalizedSearch ||
            conversation.contact_name.toLowerCase().includes(normalizedSearch) ||
            (conversation.phone_number_normalized ?? "").toLowerCase().includes(normalizedSearch) ||
            (conversation.whatsapp_account_label ?? "").toLowerCase().includes(normalizedSearch) ||
            (conversation.last_message_preview ?? "").toLowerCase().includes(normalizedSearch);

          if (!matchesSearch) {
            return false;
          }

          switch (filterMode) {
            case "mine":
              return currentOrganizationUserId ? conversation.assigned_user_id === currentOrganizationUserId : true;
            case "unread":
              return conversation.unread_count > 0;
            case "unassigned":
              return !conversation.assigned_user_id;
            case "sales":
              return Boolean(conversation.has_sales || conversation.has_sales_lead_tag);
            default:
              return true;
          }
        })
        .map((conversation, index) => ({ conversation, index }))
        .sort((left, right) => {
          if (conversationSortMode === "alphabetical") {
            return (
              left.conversation.contact_name.localeCompare(right.conversation.contact_name, undefined, {
                sensitivity: "base"
              }) || left.index - right.index
            );
          }

          const leftTime = left.conversation.last_message_at ? new Date(left.conversation.last_message_at).getTime() : 0;
          const rightTime = right.conversation.last_message_at ? new Date(right.conversation.last_message_at).getTime() : 0;

          return rightTime - leftTime || left.index - right.index;
        })
        .map(({ conversation }) => conversation),
    [conversationSortMode, conversations, currentOrganizationUserId, filterMode, searchText]
  );
  const stableSelectedConversation =
    visibleConversations.find((conversation) => conversation.id === selectedConversation?.id) ?? visibleConversations[0];
  const conversationQueryKey = useMemo(
    () => ["conversations", chatHistoryRange.unit, chatHistoryRange.value, isSuperAdmin ? activeOrganizationId ?? "current" : "current"] as const,
    [activeOrganizationId, chatHistoryRange.unit, chatHistoryRange.value, isSuperAdmin]
  );
  const messagesQueryKey = useMemo(
    () => [
      "messages",
      stableSelectedConversation?.id,
      chatHistoryRange.unit,
      chatHistoryRange.value,
      isSuperAdmin ? activeOrganizationId ?? "current" : "current"
    ] as const,
    [activeOrganizationId, chatHistoryRange.unit, chatHistoryRange.value, isSuperAdmin, stableSelectedConversation?.id]
  );
  const { data: messages = [] } = useMessages(
    stableSelectedConversation?.id,
    chatHistoryRange,
    isSuperAdmin ? activeOrganizationId : undefined,
    { refetchIntervalMs: stableSelectedConversation?.id ? 1000 : false }
  );

  useRealtimeInbox(activeOrganizationId, stableSelectedConversation?.id);

  const conversationCountLabel = `${visibleConversations.length} conversation${visibleConversations.length === 1 ? "" : "s"}`;

  useEffect(() => {
    if (!isMobile) {
      setMobilePane("chat");
      setIsContactSheetOpen(false);
      return;
    }

    setMobilePane("list");
    setIsContactSheetOpen(false);
  }, [isMobile, activeOrganizationId]);

  useEffect(() => {
    const refetchInbox = () => {
      void queryClient.refetchQueries({ queryKey: conversationQueryKey, exact: true, type: "active" });

      if (stableSelectedConversation?.id) {
        void queryClient.refetchQueries({ queryKey: messagesQueryKey, exact: true, type: "active" });
      }
    };

    refetchInbox();
    const intervalId = window.setInterval(refetchInbox, stableSelectedConversation?.id ? 1000 : 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [conversationQueryKey, messagesQueryKey, queryClient, stableSelectedConversation?.id]);

  function handleConversationSelect(conversation: Conversation) {
    setSelectedConversation(conversation);

    if (isMobile) {
      setMobilePane("chat");
    }
  }

  const conversationListCard = (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="workspace-block grid min-h-[420px] grid-rows-[auto,minmax(0,1fr)] overflow-hidden bg-white md:min-h-[520px] md:max-h-[calc(100vh-9.5rem)]" elevated>
        <header className="pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Queue</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="section-title">Work queue</h2>
              <p className="mt-1 text-sm text-text-muted">{conversationCountLabel} visible</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search contact, number, account, or message..."
                className="input-base h-11 pl-10"
                aria-label="Search conversations"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "mine", label: "Mine", count: queueCounts.mine },
                { key: "unread", label: "Unread", count: queueCounts.unread },
                { key: "unassigned", label: "Unassigned", count: queueCounts.unassigned },
                { key: "sales", label: "Sales", count: queueCounts.sales },
                { key: "all", label: "All", count: queueCounts.all }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    filterMode === item.key
                      ? "border-primary/20 bg-primary-soft text-primary"
                      : "border-border bg-white text-text-muted hover:border-primary/20 hover:text-text"
                  }`}
                  onClick={() => setFilterMode(item.key as ConversationFilterMode)}
                >
                  <span>{item.label}</span>
                  <span className="ml-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-inherit">{item.count}</span>
                </button>
              ))}
            </div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Sort</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`inline-flex h-8 items-center justify-center gap-1.5 px-2 text-xs font-semibold transition hover:text-primary ${
                  conversationSortMode === "alphabetical" ? "text-primary" : "text-text-soft"
                }`}
                title="Sort alphabetically"
                aria-label="Sort conversations alphabetically"
                aria-pressed={conversationSortMode === "alphabetical"}
                onClick={() => setConversationSortMode("alphabetical")}
              >
                <ArrowDownAZ size={16} aria-hidden="true" />
                A-Z
              </button>
              <button
                type="button"
                className={`inline-flex h-8 items-center justify-center gap-1.5 px-2 text-xs font-semibold transition hover:text-primary ${
                  conversationSortMode === "latest" ? "text-primary" : "text-text-soft"
                }`}
                title="Sort by latest message"
                aria-label="Sort conversations by latest message"
                aria-pressed={conversationSortMode === "latest"}
                onClick={() => setConversationSortMode("latest")}
              >
                <Clock3 size={16} aria-hidden="true" />
                Latest
              </button>
            </div>
          </div>
        </header>
        <div className="min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-text-muted">Loading conversations...</div>
          ) : conversationsIsError ? (
            <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm text-coral">
              {conversationsError instanceof Error ? conversationsError.message : "Unable to load conversations."}
            </div>
          ) : (
            <ConversationList
              conversations={visibleConversations}
              selectedConversationId={stableSelectedConversation?.id}
              onSelect={handleConversationSelect}
            />
          )}
        </div>
      </Card>
    </motion.div>
  );

  return (
    <section className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card elevated className="workspace-page-header p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Inbox</p>
              <h1 className="mt-2 section-title">Conversation cockpit</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
                Prioritize live WhatsApp replies, ownership, and sales follow-up from one workspace.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Unread", value: queueCounts.unread },
                  { label: "Mine", value: queueCounts.mine },
                  { label: "Open", value: queueCounts.all },
                  { label: "Unassigned", value: queueCounts.unassigned }
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-border bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">{metric.label}</p>
                    <p className="mt-1 text-lg font-semibold text-text">{metric.value}</p>
                  </div>
                ))}
              </div>
              <InboxSubTabs
                tabs={[
                  { to: "/inbox", label: "Conversations" },
                  { to: "/inbox/replies", label: "Reply library" }
                ]}
              />
            </div>
          </div>
        </Card>
      </motion.div>
      {isMobile ? (
        <>
          {mobilePane === "list" ? (
            conversationListCard
          ) : (
            <div className="space-y-3">
              <Card className="p-3" elevated>
                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-3 py-2 text-xs text-text hover:text-text"
                    onClick={() => setMobilePane("list")}
                  >
                    <ChevronLeft size={16} />
                    <span className="ml-1">Back</span>
                  </Button>
                  <div className="min-w-0 flex-1 text-center">
                    <p className="truncate text-sm font-semibold text-text">{stableSelectedConversation?.contact_name ?? "Conversation"}</p>
                    <p className="truncate text-xs text-text-muted">{stableSelectedConversation?.phone_number_normalized ?? "No phone available"}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={() => setIsContactSheetOpen(true)}
                    disabled={!stableSelectedConversation}
                  >
                    <Info size={14} />
                    <span className="ml-1">Contact</span>
                  </Button>
                </div>
              </Card>
              <ChatPanel
                conversation={stableSelectedConversation}
                conversations={visibleConversations}
                messages={messages}
                historyRangeLabel={getHistoryRangeLabel(chatHistoryRange)}
                organizationId={activeOrganizationId}
                onMessageSent={() => {
                  void queryClient.invalidateQueries({
                    queryKey: ["messages", stableSelectedConversation?.id, chatHistoryRange.unit, chatHistoryRange.value]
                  });
                  void queryClient.invalidateQueries({ queryKey: ["conversations", chatHistoryRange.unit, chatHistoryRange.value] });
                }}
              />
            </div>
          )}
          <PopupOverlay
            open={isContactSheetOpen}
            onClose={() => setIsContactSheetOpen(false)}
            title="Contact details"
            description="Contact summary and assignment for the active conversation."
            panelClassName="max-w-[min(36rem,100vw)] sm:max-w-[min(36rem,calc(100vw-2rem))]"
          >
            <ContactInfoPanel
              className="text-xs"
              conversation={stableSelectedConversation}
              mobileSheet
              onAssigned={() => {
                void queryClient.invalidateQueries({ queryKey: ["conversations", chatHistoryRange.unit, chatHistoryRange.value] });
                void queryClient.invalidateQueries({
                  queryKey: ["messages", stableSelectedConversation?.id, chatHistoryRange.unit, chatHistoryRange.value]
                });
              }}
            />
          </PopupOverlay>
        </>
      ) : (
        <div className="inbox-workspace-grid">
          <div className="inbox-side-rail inbox-queue-rail">
            {conversationListCard}
          </div>
          <div className="inbox-chat-rail">
            <ChatPanel
              conversation={stableSelectedConversation}
              conversations={visibleConversations}
              messages={messages}
              historyRangeLabel={getHistoryRangeLabel(chatHistoryRange)}
              organizationId={activeOrganizationId}
              onMessageSent={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["messages", stableSelectedConversation?.id, chatHistoryRange.unit, chatHistoryRange.value]
                });
                void queryClient.invalidateQueries({ queryKey: ["conversations", chatHistoryRange.unit, chatHistoryRange.value] });
              }}
            />
          </div>
          <div className="inbox-side-rail inbox-detail-rail">
            <ContactInfoPanel
              className="workspace-block border-primary/10 bg-white text-xs"
              conversation={stableSelectedConversation}
              onAssigned={() => {
                void queryClient.invalidateQueries({ queryKey: ["conversations", chatHistoryRange.unit, chatHistoryRange.value] });
                void queryClient.invalidateQueries({
                  queryKey: ["messages", stableSelectedConversation?.id, chatHistoryRange.unit, chatHistoryRange.value]
                });
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
