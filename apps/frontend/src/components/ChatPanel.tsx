import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AudioLines,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Video
} from "lucide-react";
import type { Conversation, Message, OutboundAttachmentInput } from "../types/api";
import { sendMessage } from "../api/crm";
import { getMessagePresentation } from "../lib/messageContent";
import { Button } from "./Button";
import { Card } from "./Card";
import { Input } from "./Input";

const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;

type ComposerAttachment = OutboundAttachmentInput;

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

function getMessageTypeIcon(messageType: string) {
  switch (messageType) {
    case "image":
      return ImageIcon;
    case "video":
      return Video;
    case "audio":
      return AudioLines;
    case "document":
      return FileText;
    case "sticker":
      return ImageIcon;
    case "location":
      return MapPin;
    case "contact":
    case "reaction":
      return MessageCircle;
    default:
      return null;
  }
}

export function ChatPanel({
  conversation,
  messages,
  historyRangeLabel,
  onMessageSent
}: {
  conversation?: Conversation;
  messages: Message[];
  historyRangeLabel: string;
  onMessageSent: () => void;
}) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestOutgoingMessage = [...messages].reverse().find((message) => message.direction === "outgoing");
  const latestOutgoingStatus = latestOutgoingMessage?.ack_status;
  const latestOutgoingStatusLabel = formatAckStatus(latestOutgoingStatus);

  async function handleSend() {
    if (!conversation || (!text.trim() && !attachment)) {
      return;
    }

    setIsSending(true);
    setSendNotice(null);
    try {
      await sendMessage({
        whatsappAccountId: conversation.whatsapp_account_id,
        conversationId: conversation.id,
        text: text.trim() || undefined,
        attachment
      });
      setText("");
      setAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSendNotice("Message queued for delivery. The latest bubble will update as dispatch and ack events arrive.");
      onMessageSent();
    } catch (error) {
      setSendNotice(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setIsSending(false);
    }
  }

  async function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setAttachment(null);
      return;
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setSendNotice("Attachment too large. Please keep files under 4 MB for the current transport path.");
      event.target.value = "";
      return;
    }

    const kind = detectAttachmentKind(file.type);

    if (!kind) {
      setSendNotice("Unsupported file type. Use image, video, audio, or document files.");
      event.target.value = "";
      return;
    }

    try {
      const dataBase64 = await fileToBase64(file);
      setAttachment({
        kind,
        fileName: file.name,
        mimeType: file.type || fallbackMimeType(kind),
        dataBase64,
        fileSizeBytes: file.size
      });
      setSendNotice(null);
    } catch {
      setSendNotice("Unable to read the selected file.");
      event.target.value = "";
    }
  }

  function handleClearAttachment() {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
    <Card className="grid min-h-[640px] max-h-[calc(100vh-9.5rem)] min-w-0 grid-rows-[auto,1fr,auto] overflow-hidden p-0" elevated>
      <header className="border-b border-border bg-white px-6 py-5 xl:px-7">
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
      <div className="space-y-4 overflow-y-auto bg-background-elevated px-3 py-5 sm:px-4 xl:px-5 2xl:px-7">
        {messages.length > 0 ? (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-white/80 px-5 py-8 text-center text-sm leading-6 text-text-muted">
            No chat history found in {historyRangeLabel.toLowerCase()}.
          </div>
        )}
      </div>
      <footer className="border-t border-border bg-white px-3 py-4 sm:px-4 xl:px-5 2xl:px-7">
        {attachment ? (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-background-tint px-3 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{attachment.kind}</p>
              <p className="truncate text-sm font-medium text-text">{attachment.fileName}</p>
              <p className="text-xs text-text-muted">
                {attachment.mimeType} • {formatBytes(attachment.fileSizeBytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearAttachment}
              className="rounded-full border border-border p-2 text-text-soft transition hover:bg-white hover:text-text"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="flex items-stretch gap-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/*,text/*"
            onChange={handleAttachmentChange}
            title="Attach a file"
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} className="rounded-xl px-4">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={attachment ? "Add an optional caption..." : "Type a reply..."}
            className="h-14 flex-1 rounded-xl px-5 text-[15px] shadow-[0_12px_30px_rgba(20,32,51,0.06)]"
          />
          <Button onClick={handleSend} disabled={isSending || (!text.trim() && !attachment)} className="min-w-[112px] rounded-xl px-6">
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
        <p className="mt-2 text-xs leading-5 text-text-soft">
          Current outbound media path supports one attachment up to 4 MB through the live queue and connector flow.
        </p>
      </footer>
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const presentation = getMessagePresentation(message);
  const Icon = getMessageTypeIcon(message.message_type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`max-w-[96%] rounded-2xl px-4 py-3.5 text-sm shadow-[0_10px_24px_rgba(20,32,51,0.06)] xl:max-w-[90%] 2xl:max-w-[85%] ${
        message.direction === "outgoing"
          ? "ml-auto border border-secondary/15 bg-secondary-soft/80 text-text"
          : "border border-border/90 bg-white text-text"
      }`}
    >
      {presentation.isMedia ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/80 bg-background-tint px-3 py-3">
            <div className="flex items-start gap-3">
              {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-soft" /> : null}
              <div className="min-w-0">
                {presentation.label ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">{presentation.label}</p>
                ) : null}
                <p className="mt-1 break-words font-medium text-text">{presentation.title}</p>
                {presentation.caption && presentation.caption !== presentation.title ? (
                  <p className="mt-2 break-words text-sm leading-6 text-text-muted">{presentation.caption}</p>
                ) : null}
                {presentation.details.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {presentation.details.map((detail) => (
                      <span
                        key={detail}
                        className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-text-soft"
                      >
                        {detail}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <p className="text-xs leading-5 text-text-soft">
            Media metadata is shown here. File preview/download will be added once storage-backed media persistence is enabled.
          </p>
        </div>
      ) : (
        <p className="break-words">{presentation.title}</p>
      )}
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
  );
}

function detectAttachmentKind(mimeType: string): ComposerAttachment["kind"] | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType) {
    return "document";
  }

  return null;
}

function fallbackMimeType(kind: ComposerAttachment["kind"]) {
  switch (kind) {
    case "image":
      return "image/jpeg";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/mpeg";
    case "document":
      return "application/octet-stream";
  }
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, dataBase64 = ""] = result.split(",");
      if (!dataBase64) {
        reject(new Error("Empty file payload"));
        return;
      }

      resolve(dataBase64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
