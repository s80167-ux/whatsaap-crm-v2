import { useState } from "react";
import { motion } from "framer-motion";
import type { Conversation, Message } from "../types/api";
import { sendMessage } from "../api/crm";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";

function formatAckStatus(status?: string) {
  switch (status) {
    case "queued":
      return "Queued";
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

function getAckTone(status?: string) {
  switch (status) {
    case "read":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "device_delivered":
    case "played":
      return "text-sky-700 bg-sky-50 border-sky-200";
    case "server_ack":
      return "text-text-soft bg-background-tint border-border";
    case "failed":
      return "text-coral bg-coral/10 border-coral/20";
    case "pending":
    case "queued":
    default:
      return "text-amber-700 bg-amber-50 border-amber-200";
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
  const latestOutgoingMessage = [...messages].reverse().find((message) => message.direction === "outgoing");
  const latestOutgoingStatus = latestOutgoingMessage?.ack_status;
  const latestOutgoingStatusLabel = formatAckStatus(latestOutgoingStatus);

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
      setSendNotice("Message queued for delivery. The latest bubble will update as dispatch and ack events arrive.");
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
    <Card className="grid min-h-[640px] max-h-[calc(100vh-9.5rem)] grid-rows-[auto,1fr,auto] overflow-hidden p-0" elevated>
      <header className="border-b border-border bg-white px-6 py-4">
        <p className="text-lg font-semibold text-text">{conversation.contact_name}</p>
        <p className="text-sm text-text-muted">{conversation.phone_number_normalized ?? "No phone available"}</p>
        {latestOutgoingStatusLabel ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-soft">Latest outbound</span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getAckTone(latestOutgoingStatus)}`}>
              {latestOutgoingStatusLabel}
            </span>
          </div>
        ) : null}
        {sendNotice ? <p className="mt-2 text-xs text-text-soft">{sendNotice}</p> : null}
      </header>
      <div className="overflow-y-auto bg-background-elevated px-5 py-4 space-y-3">
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
              {message.direction === "outgoing" ? (
                <span className={`rounded-full border px-2 py-1 font-medium ${getAckTone(message.ack_status)}`}>
                  {formatAckStatus(message.ack_status) ?? "Queued"}
                </span>
              ) : null}
            </div>
            {message.direction === "outgoing" && message.ack_status === "failed" ? (
              <p className="mt-2 text-xs leading-5 text-coral">
                Delivery failed on the last attempt. The outbox worker may retry automatically based on backend policy.
              </p>
            ) : null}
            {message.direction === "outgoing" && (message.ack_status === "pending" || !message.ack_status) ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                This message is stored safely and waiting for dispatch or acknowledgement.
              </p>
            ) : null}
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
