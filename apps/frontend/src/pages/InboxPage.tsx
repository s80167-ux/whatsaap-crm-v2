import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { ArrowDownAZ, Clock3 } from "lucide-react";
import { ChatPanel } from "../components/ChatPanel";
import { Card } from "../components/Card";
import { ContactInfoPanel } from "../components/ContactInfoPanel";
import { ConversationList } from "../components/ConversationList";
import { InboxSubTabs } from "../components/InboxSubTabs";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeInbox } from "../hooks/useRealtimeInbox";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { DEFAULT_CHAT_HISTORY_RANGE, getHistoryRangeLabel } from "../lib/historyRange";
import { getStoredUser } from "../lib/auth";
import type { Conversation } from "../types/api";

type ConversationSortMode = "alphabetical" | "latest";

export function InboxPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const activeOrganizationId = isSuperAdmin ? dashboardContext.selectedOrganizationId || null : currentUser?.organizationId ?? null;

  useRealtimeInbox(activeOrganizationId);

  const chatHistoryRange = DEFAULT_CHAT_HISTORY_RANGE;
  const [conversationSortMode, setConversationSortMode] = useState<ConversationSortMode>("latest");
  const { data: conversations = [], isLoading } = useConversations(
    chatHistoryRange,
    isSuperAdmin ? activeOrganizationId : undefined
  );
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const visibleConversations = useMemo(
    () =>
      conversations
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
    [conversationSortMode, conversations]
  );
  const stableSelectedConversation =
    visibleConversations.find((conversation) => conversation.id === selectedConversation?.id) ?? visibleConversations[0];
  const { data: messages = [] } = useMessages(
    stableSelectedConversation?.id,
    chatHistoryRange,
    isSuperAdmin ? activeOrganizationId : undefined
  );

  const conversationCountLabel = `${visibleConversations.length} conversation${visibleConversations.length === 1 ? "" : "s"}`;

  return (
    <section className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card elevated>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Inbox</p>
              <h1 className="mt-3 section-title">Conversation workspace</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                Work live conversations here, then switch to the reply library when the team needs to manage approved responses.
              </p>
            </div>
            <InboxSubTabs
              tabs={[
                { to: "/inbox", label: "Conversations" },
                { to: "/inbox/replies", label: "Reply library" }
              ]}
            />
          </div>
        </Card>
      </motion.div>
      <div className="grid gap-5 2xl:gap-6 xl:grid-cols-[420px,minmax(0,1fr)] 2xl:grid-cols-[500px,minmax(0,1.25fr)] xl:items-start">
      <div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card className="grid max-h-[calc(100vh-9.5rem)] min-h-[520px] grid-rows-[auto,minmax(0,1fr)] overflow-hidden bg-white" elevated>
            <header className="pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Inbox</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <h2 className="section-title">Latest conversations</h2>
                  <p className="mt-1 text-sm text-text-muted">{conversationCountLabel}</p>
                </div>
              </div>
              <div className="mt-4">
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
              ) : (
                <ConversationList
                  conversations={visibleConversations}
                  selectedConversationId={stableSelectedConversation?.id}
                  onSelect={setSelectedConversation}
                />
              )}
            </div>
          </Card>
        </motion.div>
        <div className="mt-3">
          <ContactInfoPanel
            className="border-primary/10 bg-white shadow-panel text-xs"
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
    </section>
  );
}
