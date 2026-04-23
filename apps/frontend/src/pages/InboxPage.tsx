import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { ChatPanel } from "../components/ChatPanel";
import { Card } from "../components/Card";
import { ContactInfoPanel } from "../components/ContactInfoPanel";
import { ConversationList } from "../components/ConversationList";
import { HistoryRangePicker } from "../components/HistoryRangePicker";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeInbox } from "../hooks/useRealtimeInbox";
import { DEFAULT_CHAT_HISTORY_RANGE, getHistoryRangeLabel } from "../lib/historyRange";
import type { Conversation } from "../types/api";

export function InboxPage() {
  useRealtimeInbox();
  const queryClient = useQueryClient();
  const [chatHistoryRange, setChatHistoryRange] = useState(DEFAULT_CHAT_HISTORY_RANGE);
  const { data: conversations = [], isLoading } = useConversations(chatHistoryRange);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const stableSelectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversation?.id) ?? conversations[0];
  const { data: messages = [] } = useMessages(stableSelectedConversation?.id, chatHistoryRange);

  const conversationCountLabel = `${conversations.length} threads in ${getHistoryRangeLabel(chatHistoryRange).toLowerCase()}`;

  return (
    <div className="grid gap-5 2xl:gap-6 xl:grid-cols-[300px,minmax(0,1fr)] 2xl:grid-cols-[340px,minmax(0,1.7fr)] xl:items-start">
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
                <HistoryRangePicker label="Chat history" range={chatHistoryRange} onChange={setChatHistoryRange} />
              </div>
            </header>
            <div className="min-h-0 overflow-y-auto">
              {isLoading ? (
                <div className="flex min-h-[220px] items-center justify-center text-sm text-text-muted">Loading conversations...</div>
              ) : (
                <ConversationList
                  conversations={conversations}
                  selectedConversationId={stableSelectedConversation?.id}
                  onSelect={setSelectedConversation}
                />
              )}
            </div>
          </Card>
        </motion.div>
        <div className="mt-3">
          <ContactInfoPanel
            className="!p-2 !bg-background-tint !shadow-none !rounded-lg text-xs"
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
        messages={messages}
        historyRangeLabel={getHistoryRangeLabel(chatHistoryRange)}
        onMessageSent={() => {
          void queryClient.invalidateQueries({
            queryKey: ["messages", stableSelectedConversation?.id, chatHistoryRange.unit, chatHistoryRange.value]
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations", chatHistoryRange.unit, chatHistoryRange.value] });
        }}
      />
    </div>
  );
}
