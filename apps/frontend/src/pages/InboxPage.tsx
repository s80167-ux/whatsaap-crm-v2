import { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { ChatPanel } from "../components/ChatPanel";
import { Card } from "../components/Card";
import { ContactInfoPanel } from "../components/ContactInfoPanel";
import { ConversationList } from "../components/ConversationList";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useRealtimeInbox } from "../hooks/useRealtimeInbox";
import type { Conversation } from "../types/api";

export function InboxPage() {
  useRealtimeInbox();
  const queryClient = useQueryClient();
  const { data: conversations = [], isLoading } = useConversations();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const stableSelectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversation?.id) ?? conversations[0];
  const { data: messages = [] } = useMessages(stableSelectedConversation?.id);

  const conversationCountLabel = `${conversations.length} active threads`;

  return (
    <div className="grid gap-5 2xl:gap-6 xl:grid-cols-[300px,minmax(0,1fr)] 2xl:grid-cols-[340px,minmax(0,1.7fr),300px] xl:items-start">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card className="grid max-h-[calc(100vh-9.5rem)] grid-rows-[auto,1fr] bg-white xl:sticky xl:top-0" elevated>
          <header className="pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Inbox</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="section-title">Latest conversations</h2>
                <p className="mt-1 text-sm text-text-muted">{conversationCountLabel}</p>
              </div>
            </div>
          </header>
          {isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-text-muted">Loading conversations...</div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedConversationId={stableSelectedConversation?.id}
              onSelect={setSelectedConversation}
            />
          )}
        </Card>
      </motion.div>
      <ChatPanel
        conversation={stableSelectedConversation}
        messages={messages}
        onMessageSent={() => {
          void queryClient.invalidateQueries({ queryKey: ["messages", stableSelectedConversation?.id] });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }}
      />
      <ContactInfoPanel
        className="xl:col-span-2 2xl:col-span-1"
        conversation={stableSelectedConversation}
        onAssigned={() => {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          void queryClient.invalidateQueries({ queryKey: ["messages", stableSelectedConversation?.id] });
        }}
      />
    </div>
  );
}
