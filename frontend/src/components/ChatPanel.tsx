import { useState } from "react";
import { motion } from "framer-motion";
import type { Conversation, Message } from "../types/api";
import { sendMessage } from "../api/crm";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";

export function ChatPanel({
  conversation,
  messages,
  onMessageSent
}: {
  conversation?: Conversation;
  messages: Message[];
  onMessageSent: () => void;
}) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSend() {
    if (!conversation || !text.trim()) {
      return;
    }

    setIsSending(true);
    try {
      await sendMessage({
        whatsappAccountId: conversation.whatsapp_account_id,
        conversationId: conversation.id,
        text
      });
      setText("");
      onMessageSent();
    } finally {
      setIsSending(false);
    }
  }

  if (!conversation) {
    return (
      <Card className="flex h-full items-center justify-center p-10" elevated>
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-text">Pick a conversation</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Threads stay stable because each conversation is anchored to one contact and one WhatsApp account.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="grid h-full grid-rows-[auto,1fr,auto] overflow-hidden p-0" elevated>
      <header className="border-b border-border bg-white px-6 py-5">
        <p className="text-lg font-semibold text-text">{conversation.contact_name}</p>
        <p className="text-sm text-text-muted">{conversation.phone_number_normalized ?? "No phone available"}</p>
      </header>
      <div className="overflow-y-auto bg-background-elevated px-6 py-5 space-y-4">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
              message.direction === "outbound"
                ? "ml-auto border border-primary/10 bg-primary-soft text-text"
                : "border border-border bg-white text-text"
            }`}
          >
            <p>{message.content_text ?? `[${message.message_type}]`}</p>
            <p className="mt-2 text-xs text-text-soft">{new Date(message.sent_at).toLocaleString()}</p>
          </motion.div>
        ))}
      </div>
      <footer className="border-t border-border bg-white p-4">
        <div className="flex gap-3">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type a reply..."
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isSending} className="px-5">
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </footer>
    </Card>
  );
}
