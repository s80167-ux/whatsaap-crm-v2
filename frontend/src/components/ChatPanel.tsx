import { useState } from "react";
import { motion } from "framer-motion";
import type { Conversation, Message } from "../types/api";
import { sendMessage } from "../api/crm";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";

function formatAckStatus(status?: string) {
  switch (status) {
    case "server_ack":
      return "Sent";
    case "device_delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "played":
      return "Played";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    default:
      return null;
  }
}

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
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  async function handleSend() {
    if (!conversation || !text.trim()) {
      return;
    }

    setIsSending(true);
    setSendNotice(null);
    try {
      await sendMessage({
        whatsappAccountId: conversation.whatsapp_account_id,
        conversationId: conversation.id,
        text
      });
      setText("");
      setSendNotice("Message queued and stored. Watch the latest bubble for ack status.");
      onMessageSent();
    } catch (error) {
      setSendNotice(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setIsSending(false);
    }
  }

  if (!conversation) {
    return (
      <Card className="flex min-h-[420px] items-center justify-center p-10" elevated>
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
    <Card className="grid min-h-[640px] min-w-0 grid-rows-[auto,1fr,auto] p-0" elevated>
      <header className="border-b border-border bg-white px-6 py-4">
        <p className="text-lg font-semibold text-text">{conversation.contact_name}</p>
        <p className="text-sm text-text-muted">{conversation.phone_number_normalized ?? "No phone available"}</p>
        {sendNotice ? <p className="mt-2 text-xs text-text-soft">{sendNotice}</p> : null}
      </header>
      <div className="bg-background-elevated px-5 py-4 space-y-3">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
              message.direction === "outgoing"
                ? "ml-auto border border-secondary/10 bg-secondary-soft/70 text-text"
                : "border border-border bg-white text-text"
            }`}
          >
            <p>{message.content_text ?? `[${message.message_type}]`}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-soft">
              <p>{new Date(message.sent_at).toLocaleString()}</p>
              {message.direction === "outgoing" ? <p>{formatAckStatus(message.ack_status) ?? "Queued"}</p> : null}
            </div>
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
