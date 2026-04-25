import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AudioLines,
  Check,
  Copy,
  Paperclip,
  Smile,
  Sparkles,
  Wand2,
  X,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Forward,
  Reply,
  Trash2,
  Video
} from "lucide-react";
import type { Conversation, Message, OutboundAttachmentInput, QuickReplyVariableDefinition } from "../types/api";
import { deleteMessage, forwardMessage, recordQuickReplyUsage, sendMessage } from "../api/crm";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { getMessagePresentation } from "../lib/messageContent";
import { useQuickReplies } from "../hooks/useQuickReplies";
import { Button } from "./Button";
import { Card } from "./Card";
import { PanelPagination, usePanelPagination } from "./PanelPagination";
import { PopupOverlay } from "./PopupOverlay";
import { Toast } from "./Toast";
console.log("ORG ID >>>", organizationId);
const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;
const QUICK_REPLIES = [
  "Hi, thanks for reaching out. How can I help you today?",
  "Noted, let me check and get back to you shortly.",
  "Can you share a little more detail so I can assist better?",
  "Thank you. We have received your message and will update you soon.",
  "Would you like me to arrange the next step for you?"
];
const EMOJI_CHOICES = ["😊", "👍", "🙏", "✅", "🔥", "🎉", "📌", "📞", "💬", "🚚", "💳", "✨"];

const FOLLOW_UP_PROMPTS = [
  {
    title: "Confirm next step",
    body: "Just to confirm, would you like me to proceed with the next step?"
  },
  {
    title: "Ask for details",
    body: "Could you share your preferred date, location, and any special requirements?"
  },
  {
    title: "Payment reminder",
    body: "A gentle reminder that payment is still pending. Let me know once it has been completed."
  },
  {
    title: "Follow-up check",
    body: "Hi, just checking in. Do you still need help with this?"
  }
];

type ComposerAttachment = OutboundAttachmentInput;
type QuickReplyItem = {
  id: string;
  title: string;
  body: string;
  category?: string | null;
  variableDefinitions?: QuickReplyVariableDefinition[];
  isOrganizationTemplate: boolean;
};
type TemplatePreviewState = {
  reply: QuickReplyItem;
  variables: QuickReplyVariableDefinition[];
  values: Record<string, string>;
};
type ReplyDraftState = {
  messageId: string;
  previewText: string;
};

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
  conversations,
  messages,
  historyRangeLabel,
  organizationId,
  onMessageSent
}: {
  conversation?: Conversation;
  conversations: Conversation[];
  messages: Message[];
  historyRangeLabel: string;
  organizationId?: string | null;
  onMessageSent: () => void;
}) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [isQuickReplyOpen, setIsQuickReplyOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<TemplatePreviewState | null>(null);
  const [quickReplySearch, setQuickReplySearch] = useState("");
  const [selectedQuickReplyCategory, setSelectedQuickReplyCategory] = useState<string | null>(null);
  const [selectedQuickReplyTemplateId, setSelectedQuickReplyTemplateId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraftState | null>(null);
  const [forwardSourceMessage, setForwardSourceMessage] = useState<Message | null>(null);
  const [forwardTargetConversationId, setForwardTargetConversationId] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestOutgoingMessage = [...messages].reverse().find((message) => message.direction === "outgoing");
  const latestOutgoingStatus = latestOutgoingMessage?.ack_status;
  const latestOutgoingStatusLabel = formatAckStatus(latestOutgoingStatus);
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const forwardableConversations = conversations.filter((item) => item.id !== conversation?.id);
  const selectedMessages = selectedMessageIds.map((messageId) => messagesById.get(messageId)).filter((message): message is Message => Boolean(message));
  const { toast: copyToast, copyText } = useCopyFeedback();
  const { data: organizationQuickReplies = [], isLoading: quickRepliesLoading } = useQuickReplies({
    organizationId,
    enabled: Boolean(conversation)
  });
  const quickReplies: QuickReplyItem[] = organizationQuickReplies.length > 0
    ? organizationQuickReplies.map((template) => ({
        id: template.id,
        title: template.title,
        body: template.body,
        category: template.category,
        variableDefinitions: template.variable_definitions ?? [],
        isOrganizationTemplate: true
      }))
    : QUICK_REPLIES.map((reply) => ({
        id: reply,
        title: reply,
        body: reply,
        category: "Starter",
        isOrganizationTemplate: false
      }));
  const quickReplyCategories = Array.from(
    new Set(quickReplies.map((reply) => reply.category).filter((category): category is string => Boolean(category)))
  ).sort((left, right) => left.localeCompare(right));
  const normalizedQuickReplySearch = quickReplySearch.trim().toLowerCase();
  const filteredQuickReplies = quickReplies.filter((reply) => {
    const matchesCategory = !selectedQuickReplyCategory || reply.category === selectedQuickReplyCategory;
    const matchesSearch =
      !normalizedQuickReplySearch ||
      reply.title.toLowerCase().includes(normalizedQuickReplySearch) ||
      reply.body.toLowerCase().includes(normalizedQuickReplySearch) ||
      (reply.category ?? "").toLowerCase().includes(normalizedQuickReplySearch);

    return matchesCategory && matchesSearch;
  });
  const quickReplyPagination = usePanelPagination(filteredQuickReplies);

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
  organizationId: organizationId, // 🔥 ADD THIS
  quickReplyTemplateId: selectedQuickReplyTemplateId,
  replyToMessageId: replyDraft?.messageId ?? null,
  text: text.trim() || undefined,
  attachment
});
      setText("");
      setAttachment(null);
      setSelectedQuickReplyTemplateId(null);
      setReplyDraft(null);
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

  function insertComposerText(value: string) {
    setSelectedQuickReplyTemplateId(null);
    setText((current) => {
      const needsSpace = current.length > 0 && !current.endsWith(" ") && !value.startsWith(" ");
      return `${current}${needsSpace ? " " : ""}${value}`;
    });
    textareaRef.current?.focus();
  }

  function insertVariable(value: string) {
    insertComposerText(value);
    setIsActionsOpen(false);
  }

  function closeComposerPopups() {
    setIsQuickReplyOpen(false);
    setIsEmojiOpen(false);
    setIsActionsOpen(false);
    setTemplatePreview(null);
  }

  function applyFollowUpPrompt(value: string) {
    setSelectedQuickReplyTemplateId(null);
    setText((current) => current.trim() ? `${current.trim()}\n\n${value}` : value);
    setIsActionsOpen(false);
    textareaRef.current?.focus();
  }

  function handleReplyToMessage(message: Message) {
    setReplyDraft({
      messageId: message.id,
      previewText: getBubblePreviewText(message)
    });
    textareaRef.current?.focus();
  }

  async function handleDeleteMessage(message: Message) {
    const confirmed = window.confirm("Delete this chat bubble from the conversation?");

    if (!confirmed) {
      return;
    }

    setDeletingMessageId(message.id);
    setSendNotice(null);
    try {
      await deleteMessage({ messageId: message.id });
      if (replyDraft?.messageId === message.id) {
        setReplyDraft(null);
      }
      setSendNotice("Chat bubble deleted from this conversation.");
      onMessageSent();
    } catch (error) {
      setSendNotice(error instanceof Error ? error.message : "Unable to delete message");
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function handleCopyMessage(message: Message) {
    await copyText({
      text: formatMessagesForCopy([message]),
      label: "Chat bubble"
    });
  }

  function handleToggleMessageSelection(message: Message) {
    setSelectedMessageIds((current) =>
      current.includes(message.id) ? current.filter((messageId) => messageId !== message.id) : [...current, message.id]
    );
  }

  function clearSelectedMessages() {
    setSelectedMessageIds([]);
  }

  async function handleCopySelectedMessages() {
    if (selectedMessages.length === 0) {
      return;
    }

    await copyText({
      text: formatMessagesForCopy(selectedMessages),
      label: selectedMessages.length === 1 ? "Chat bubble" : "Chat bubbles"
    });
  }

  async function handleDeleteSelectedMessages() {
    const deletableMessages = selectedMessages.filter((message) => !message.is_deleted);

    if (deletableMessages.length === 0) {
      setSendNotice("Selected bubbles are already deleted.");
      return;
    }

    const confirmed = window.confirm(
      deletableMessages.length === 1
        ? "Delete the selected chat bubble from the conversation?"
        : `Delete ${deletableMessages.length} selected chat bubbles from the conversation?`
    );

    if (!confirmed) {
      return;
    }

    setIsBulkDeleting(true);
    setSendNotice(null);
    try {
      await Promise.all(deletableMessages.map(async (message) => deleteMessage({ messageId: message.id })));
      if (replyDraft && deletableMessages.some((message) => message.id === replyDraft.messageId)) {
        setReplyDraft(null);
      }
      clearSelectedMessages();
      setSendNotice(
        deletableMessages.length === 1
          ? "Selected chat bubble deleted from this conversation."
          : `${deletableMessages.length} chat bubbles deleted from this conversation.`
      );
      onMessageSent();
    } catch (error) {
      setSendNotice(error instanceof Error ? error.message : "Unable to delete selected messages");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function handleOpenForwardPicker(message: Message) {
    setForwardSourceMessage(message);
    setForwardTargetConversationId(forwardableConversations[0]?.id ?? "");
  }

  async function handleForwardSelectedMessage() {
    if (!forwardSourceMessage || !forwardTargetConversationId) {
      return;
    }

    setIsForwarding(true);
    setSendNotice(null);
    try {
      await forwardMessage({
        messageId: forwardSourceMessage.id,
        targetConversationId: forwardTargetConversationId
      });
      setForwardSourceMessage(null);
      setForwardTargetConversationId("");
      setSendNotice("Chat bubble forwarded to the selected contact.");
      onMessageSent();
    } catch (error) {
      setSendNotice(error instanceof Error ? error.message : "Unable to forward message");
    } finally {
      setIsForwarding(false);
    }
  }

  function commitQuickReply(reply: QuickReplyItem, body: string) {
    setText(body);
    setSelectedQuickReplyTemplateId(reply.isOrganizationTemplate ? reply.id : null);
    setIsQuickReplyOpen(false);
    setQuickReplySearch("");
    setSelectedQuickReplyCategory(null);
    setTemplatePreview(null);
    textareaRef.current?.focus();

    if (reply.isOrganizationTemplate) {
      void recordQuickReplyUsage({
        templateId: reply.id,
        organizationId,
        conversationId: conversation?.id
      }).catch(() => undefined);
    }
  }

  function applyQuickReply(reply: QuickReplyItem) {
    const variables = buildTemplateVariableDefinitions(reply, conversation);

    if (variables.length === 0) {
      commitQuickReply(reply, reply.body);
      return;
    }

    setTemplatePreview({
      reply,
      variables,
      values: Object.fromEntries(
        variables.map((definition) => [
          definition.key,
          definition.default_value ?? getTemplateVariableDefault(definition.key, conversation)
        ])
      )
    });
    setIsQuickReplyOpen(false);
  }

  function updateTemplatePreviewValue(key: string, value: string) {
    setTemplatePreview((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              [key]: value
            }
          }
        : current
    );
  }

  function applyTemplatePreview() {
    if (!templatePreview) {
      return;
    }

    const missingRequiredVariables = templatePreview.variables.filter(
      (definition) => definition.required && !templatePreview.values[definition.key]?.trim()
    );

    if (missingRequiredVariables.length > 0) {
      return;
    }

    commitQuickReply(
      templatePreview.reply,
      resolveTemplateBody(templatePreview.reply.body, templatePreview.values)
    );
  }

  const missingRequiredPreviewVariables = templatePreview
    ? templatePreview.variables.filter((definition) => definition.required && !templatePreview.values[definition.key]?.trim())
    : [];

  useEffect(() => {
    setSelectedMessageIds([]);
    setReplyDraft(null);
    setForwardSourceMessage(null);
    setForwardTargetConversationId("");
  }, [conversation?.id]);

  useEffect(() => {
    setSelectedMessageIds((current) => current.filter((messageId) => messagesById.has(messageId)));
  }, [messages]);

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
        {selectedMessages.length > 0 ? (
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-white/95 px-4 py-3 shadow-[0_10px_24px_rgba(20,32,51,0.08)] backdrop-blur">
            <p className="text-sm font-medium text-text">
              {selectedMessages.length} bubble{selectedMessages.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-2 text-xs"
                onClick={() => {
                  void handleCopySelectedMessages();
                }}
              >
                Copy selected
              </Button>
              <Button
                type="button"
                className="px-3 py-2 text-xs"
                onClick={() => {
                  void handleDeleteSelectedMessages();
                }}
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? "Deleting..." : "Delete selected"}
              </Button>
              <Button type="button" variant="ghost" className="px-3 py-2 text-xs" onClick={clearSelectedMessages}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}
        {messages.length > 0 ? (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              repliedMessage={message.reply_to_message_id ? messagesById.get(message.reply_to_message_id) : undefined}
              isDeleting={deletingMessageId === message.id}
              isSelected={selectedMessageIds.includes(message.id)}
              onReply={handleReplyToMessage}
              onForward={handleOpenForwardPicker}
              onCopy={handleCopyMessage}
              onDelete={handleDeleteMessage}
              onToggleSelection={handleToggleMessageSelection}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-white/80 px-5 py-8 text-center text-sm leading-6 text-text-muted">
            No chat history found in {historyRangeLabel.toLowerCase()}.
          </div>
        )}
      </div>
      <footer className="border-t border-border bg-white px-3 py-4 sm:px-4 xl:px-5 2xl:px-7">
        {replyDraft ? (
          <div className="mb-3 rounded-2xl border border-primary/15 bg-primary-soft/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Replying to bubble</p>
                <p className="mt-1 line-clamp-2 text-sm text-text">{replyDraft.previewText}</p>
              </div>
              <button
                type="button"
                title="Cancel reply"
                onClick={() => setReplyDraft(null)}
                className="rounded-full border border-border bg-white p-2 text-text-soft transition hover:text-text"
                aria-label="Cancel reply"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
        {attachment ? (
          <AttachmentPreview attachment={attachment} onClear={handleClearAttachment} />
        ) : null}
        <div className="flex flex-wrap items-stretch gap-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/*,text/*"
            onChange={handleAttachmentChange}
            title="Attach a file"
          />
          <Button
            type="button"
            variant="ghost"
            title="Attach a file"
            aria-label="Attach a file"
            onClick={() => fileInputRef.current?.click()}
            className="h-14 px-3 text-primary hover:bg-primary-soft/50"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            title={isEmojiOpen ? "Close emoji picker" : "Open emoji picker"}
            aria-label={isEmojiOpen ? "Close emoji picker" : "Open emoji picker"}
            onClick={() => {
              const shouldOpen = !isEmojiOpen;
              closeComposerPopups();
              setIsEmojiOpen(shouldOpen);
            }}
            className="h-14 px-3 text-primary hover:bg-primary-soft/50"
          >
            <Smile className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            title={isQuickReplyOpen ? "Close quick replies" : "Open quick replies"}
            aria-label={isQuickReplyOpen ? "Close quick replies" : "Open quick replies"}
            onClick={() => {
              const shouldOpen = !isQuickReplyOpen;
              closeComposerPopups();
              setIsQuickReplyOpen(shouldOpen);
            }}
            className="h-14 px-3 text-primary hover:bg-primary-soft/50"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            title={isActionsOpen ? "Close composer actions" : "Open composer actions"}
            aria-label={isActionsOpen ? "Close composer actions" : "Open composer actions"}
            onClick={() => {
              const shouldOpen = !isActionsOpen;
              closeComposerPopups();
              setIsActionsOpen(shouldOpen);
            }}
            className="h-14 px-3 text-primary hover:bg-primary-soft/50"
          >
            <Wand2 className="h-4 w-4" />
          </Button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => {
              if (!text.trim()) {
                setSelectedQuickReplyTemplateId(null);
              }
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={attachment ? "Add an optional caption..." : "Type a reply..."}
            rows={1}
            className="min-h-7 flex-1 resize-none rounded-xl border border-border bg-white px-5 py-2 text-[15px] text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
          />
          <Button onClick={handleSend} disabled={isSending || (!text.trim() && !attachment)} className="min-w-[112px] rounded-xl px-6">
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
        <p className="mt-2 text-xs leading-5 text-text-soft">
          Use Ctrl+Enter to send. Current outbound media path supports one attachment up to 4 MB through the live queue and connector flow.
        </p>
      </footer>
      <PopupOverlay
        open={isQuickReplyOpen}
        onClose={() => setIsQuickReplyOpen(false)}
        title="Quick replies"
        description={
          organizationQuickReplies.length > 0
            ? "Approved organization replies ready to insert into the composer."
            : "Starter replies until your admin creates organization templates."
        }
        panelClassName="max-w-5xl"
      >
        <div className="space-y-4">
          <input
            value={quickReplySearch}
            onChange={(event) => setQuickReplySearch(event.target.value)}
            placeholder="Search quick replies..."
            className="h-11 w-full border border-border bg-white px-4 text-sm text-text outline-none transition placeholder:text-text-soft focus:border-primary/30"
          />
          {quickReplyCategories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                title="Show all quick replies"
                onClick={() => setSelectedQuickReplyCategory(null)}
                className={`border px-3 py-1.5 text-xs font-medium transition ${
                  selectedQuickReplyCategory
                    ? "border-border bg-white text-text-muted hover:text-text"
                    : "border-primary/25 bg-primary/10 text-primary"
                }`}
              >
                All
              </button>
              {quickReplyCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  title={`Filter quick replies by ${category}`}
                  onClick={() => setSelectedQuickReplyCategory(category)}
                  className={`border px-3 py-1.5 text-xs font-medium transition ${
                    selectedQuickReplyCategory === category
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : "border-border bg-white text-text-muted hover:text-text"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {quickRepliesLoading ? (
              <p className="border border-border bg-background-tint px-4 py-3 text-xs text-text-muted">
                Loading organization replies...
              </p>
            ) : null}
            {!quickRepliesLoading && filteredQuickReplies.length === 0 ? (
              <p className="border border-dashed border-border bg-background-tint px-4 py-5 text-xs leading-5 text-text-muted">
                No quick replies match your search or selected category.
              </p>
            ) : null}
            {quickReplyPagination.visibleItems.map((reply) => (
              <button
                key={reply.id}
                type="button"
                title={`Insert quick reply: ${reply.title}`}
                onClick={() => applyQuickReply(reply)}
                className="border border-border bg-white px-4 py-3 text-left text-xs leading-5 text-text-muted transition hover:border-primary/30 hover:bg-primary/5 hover:text-text"
              >
                <span className="block font-semibold text-text">{reply.title}</span>
                {reply.category ? <span className="mt-1 block text-[11px] uppercase tracking-[0.16em] text-text-soft">{reply.category}</span> : null}
                <span className="mt-1 block">{reply.body}</span>
              </button>
            ))}
          </div>
          <PanelPagination
            page={quickReplyPagination.page}
            pageCount={quickReplyPagination.pageCount}
            totalItems={quickReplyPagination.totalItems}
            onPageChange={quickReplyPagination.setPage}
          />
        </div>
      </PopupOverlay>
      <PopupOverlay
        open={isEmojiOpen}
        onClose={() => setIsEmojiOpen(false)}
        title="Emoji picker"
        description="Choose an emoji to insert into the current reply."
        panelClassName="max-w-xl"
      >
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {EMOJI_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              title={`Insert ${emoji}`}
              onClick={() => insertComposerText(emoji)}
              className="flex h-14 items-center justify-center border border-border bg-background-tint text-2xl transition hover:border-primary/30 hover:bg-primary/5"
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopupOverlay>
      <PopupOverlay
        open={Boolean(templatePreview)}
        onClose={() => setTemplatePreview(null)}
        title="Template preview"
        description="Review variables before inserting this quick reply into the composer."
        panelClassName="max-w-4xl"
      >
        {templatePreview ? (
          <div className="grid gap-4 lg:grid-cols-[280px,minmax(0,1fr)]">
            <div className="border border-border bg-background-tint p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Variables</p>
              <div className="mt-3 space-y-3">
                {templatePreview.variables.map((definition) => (
                  <label key={definition.key} className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-text-soft">
                      {formatTemplateVariableLabel(definition.key)}
                      {definition.required ? " *" : " optional"}
                    </span>
                    <input
                      value={templatePreview.values[definition.key] ?? ""}
                      onChange={(event) => updateTemplatePreviewValue(definition.key, event.target.value)}
                      placeholder={definition.required ? "Required value" : "Optional value"}
                      className="h-10 w-full border border-border bg-white px-3 text-sm text-text outline-none transition placeholder:text-text-soft focus:border-primary/30"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="border border-border bg-background-tint p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Resolved message</p>
              <div className="mt-3 border border-border bg-white px-4 py-3 text-sm leading-6 text-text">
                {resolveTemplateBody(templatePreview.reply.body, templatePreview.values)}
              </div>
              {missingRequiredPreviewVariables.length > 0 ? (
                <p className="mt-3 text-xs leading-5 text-amber-200">
                  Fill the required variables before inserting this template:{" "}
                  {missingRequiredPreviewVariables.map((definition) => formatTemplateVariableLabel(definition.key)).join(", ")}.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setTemplatePreview(null)}>
                  Cancel
                </Button>
                <Button
                  className="px-3 py-2 text-xs"
                  onClick={applyTemplatePreview}
                  disabled={missingRequiredPreviewVariables.length > 0}
                >
                  Insert into composer
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </PopupOverlay>
      <PopupOverlay
        open={isActionsOpen}
        onClose={() => setIsActionsOpen(false)}
        title="Composer actions"
        description="Insert customer variables or add a guided follow-up prompt."
        panelClassName="max-w-4xl"
      >
        <div className="grid gap-4 lg:grid-cols-[300px,minmax(0,1fr)]">
          <div className="border border-border bg-background-tint p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Variables</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                title="Insert contact name"
                onClick={() => insertVariable(conversation.contact_name ?? "customer")}
                className="border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-primary/30 hover:text-text"
              >
                Contact name
              </button>
              {conversation.phone_number_normalized ? (
                <button
                  type="button"
                  title="Insert phone number"
                  onClick={() => insertVariable(conversation.phone_number_normalized ?? "")}
                  className="border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-primary/30 hover:text-text"
                >
                  Phone number
                </button>
              ) : null}
            </div>
          </div>
          <div className="border border-border bg-background-tint p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Follow-up prompts</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {FOLLOW_UP_PROMPTS.map((prompt) => (
                <button
                  key={prompt.title}
                  type="button"
                  title={`Insert follow-up prompt: ${prompt.title}`}
                  onClick={() => applyFollowUpPrompt(prompt.body)}
                  className="border border-border bg-white px-3 py-3 text-left text-xs leading-5 text-text-muted transition hover:border-primary/30 hover:bg-primary/5 hover:text-text"
                >
                  <span className="block font-semibold text-text">{prompt.title}</span>
                  <span className="mt-1 block">{prompt.body}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopupOverlay>
      <PopupOverlay
        open={Boolean(forwardSourceMessage)}
        onClose={() => {
          if (isForwarding) {
            return;
          }
          setForwardSourceMessage(null);
          setForwardTargetConversationId("");
        }}
        title="Forward chat bubble"
        description="Choose another contact conversation to receive this message."
        panelClassName="max-w-3xl"
      >
        <div className="space-y-4">
          {forwardSourceMessage ? (
            <div className="border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/78">
              {getBubblePreviewText(forwardSourceMessage)}
            </div>
          ) : null}
          {forwardableConversations.length > 0 ? (
            <div className="grid gap-2">
              {forwardableConversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setForwardTargetConversationId(item.id)}
                  className={`border px-4 py-3 text-left transition ${
                    forwardTargetConversationId === item.id
                      ? "border-primary/30 bg-primary/20 text-white"
                      : "border-white/10 bg-white/8 text-white/72 hover:text-white"
                  }`}
                >
                  <span className="block text-sm font-semibold">{item.contact_name}</span>
                  <span className="mt-1 block text-xs text-inherit">{item.phone_number_normalized ?? "No phone available"}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="border border-dashed border-white/14 bg-white/6 px-4 py-5 text-sm text-white/64">
              No other conversations are available for forwarding yet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="px-3 py-2 text-xs"
              onClick={() => {
                setForwardSourceMessage(null);
                setForwardTargetConversationId("");
              }}
              disabled={isForwarding}
            >
              Cancel
            </Button>
            <Button
              className="px-3 py-2 text-xs"
              onClick={handleForwardSelectedMessage}
              disabled={!forwardTargetConversationId || isForwarding || forwardableConversations.length === 0}
            >
              {isForwarding ? "Forwarding..." : "Forward bubble"}
            </Button>
          </div>
        </div>
      </PopupOverlay>
      <Toast message={copyToast?.message ?? null} variant={copyToast?.variant} />
    </Card>
  );
}

function MessageBubble({
  message,
  repliedMessage,
  isDeleting,
  isSelected,
  onReply,
  onForward,
  onCopy,
  onDelete,
  onToggleSelection
}: {
  message: Message;
  repliedMessage?: Message;
  isDeleting: boolean;
  isSelected: boolean;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (message: Message) => void;
  onDelete: (message: Message) => void;
  onToggleSelection: (message: Message) => void;
}) {
  const presentation = getMessagePresentation(message);
  const Icon = getMessageTypeIcon(message.message_type);
  const replyContext = getReplyContext(message, repliedMessage);
  const isDeleted = Boolean(message.is_deleted);
  const showSelectionActions = !isDeleted;
  const showOutboundActions = message.direction === "outgoing" && !isDeleted;

  return (
    <div className={`flex flex-col ${message.direction === "outgoing" ? "items-end" : "items-start"}`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={`max-w-[96%] rounded-2xl px-4 py-3.5 text-sm shadow-[0_10px_24px_rgba(20,32,51,0.06)] xl:max-w-[90%] 2xl:max-w-[85%] ${
          message.direction === "outgoing"
            ? isDeleted
              ? "ml-auto border border-border/70 bg-slate-100/90 text-text-muted"
              : "ml-auto border border-secondary/15 bg-secondary-soft/80 text-text"
            : isDeleted
              ? "border border-border/70 bg-slate-100/90 text-text-muted"
              : "border border-border/90 bg-white text-text"
        }`}
      >
        {replyContext ? (
          <div className="mb-3 rounded-xl border border-border/80 bg-white/75 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">
              Replying to {replyContext.direction === "incoming" ? "contact" : "outbound"}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-text-muted">{replyContext.previewText}</p>
          </div>
        ) : null}
        {isDeleted ? (
          <p className="italic text-text-muted">This message was deleted</p>
        ) : presentation.isMedia ? (
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
            {presentation.previewUrl ? (
              <MediaPreview
                messageType={message.message_type}
                previewUrl={presentation.previewUrl}
                mimeType={presentation.mimeType}
                fileName={presentation.fileName ?? presentation.title}
              />
            ) : null}
          </div>
        ) : (
          <p className="break-words">{presentation.title}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-soft">
          <p>{new Date(message.sent_at).toLocaleString()}</p>
          {message.direction === "outgoing" && !isDeleted ? (
            <span className={`rounded-full border px-2 py-1 font-medium ${getAckTone(message.ack_status)}`}>
              {formatAckStatus(message.ack_status) ?? "Queued"}
            </span>
          ) : null}
        </div>
        {message.direction === "outgoing" && !isDeleted && message.ack_status === "failed" ? (
          <p className="mt-2 text-xs leading-5 text-coral">
            Delivery failed on the last attempt. The outbox worker may retry automatically based on backend policy.
          </p>
        ) : null}
        {message.direction === "outgoing" && !isDeleted && (message.ack_status === "pending" || !message.ack_status) ? (
          <p className="mt-2 text-xs leading-5 text-amber-700">
            This message is stored safely and waiting for dispatch or acknowledgement.
          </p>
        ) : null}
      </motion.div>
      {showSelectionActions ? (
        <div className="mt-2 flex items-center gap-1.5 pr-2 text-text-soft">
          <BubbleActionButton
            label={isSelected ? "Untick bubble" : "Tick bubble"}
            onClick={() => onToggleSelection(message)}
            icon={<Check className="h-3.5 w-3.5" />}
            active={isSelected}
          />
          <BubbleActionButton
            label="Copy bubble"
            onClick={() => {
              void onCopy(message);
            }}
            icon={<Copy className="h-3.5 w-3.5" />}
          />
          {showOutboundActions ? (
            <BubbleActionButton
              label="Reply to bubble"
              onClick={() => onReply(message)}
              icon={<Reply className="h-3.5 w-3.5" />}
            />
          ) : null}
          {showOutboundActions ? (
            <BubbleActionButton
              label="Forward bubble"
              onClick={() => onForward(message)}
              icon={<Forward className="h-3.5 w-3.5" />}
            />
          ) : null}
          <BubbleActionButton
            label={isDeleting ? "Deleting bubble" : "Delete bubble"}
            onClick={() => onDelete(message)}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            disabled={isDeleting}
          />
        </div>
      ) : null}
    </div>
  );
}

function BubbleActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  active = false
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-primary/35 bg-primary/10 text-primary"
          : "border-border text-text-soft hover:border-primary/30 hover:text-primary"
      }`}
    >
      {icon}
    </button>
  );
}

function AttachmentPreview({
  attachment,
  onClear
}: {
  attachment: ComposerAttachment;
  onClear: () => void;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-border bg-background-tint p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {attachment.kind === "image" ? (
            <img
              src={`data:${attachment.mimeType};base64,${attachment.dataBase64}`}
              alt={attachment.fileName}
              className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-border bg-white">
              <AttachmentPreviewIcon kind={attachment.kind} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{attachment.kind} preview</p>
            <p className="mt-1 truncate text-sm font-medium text-text">{attachment.fileName}</p>
            <p className="mt-1 text-xs text-text-muted">
              {attachment.mimeType} / {formatBytes(attachment.fileSizeBytes)}
            </p>
            <p className="mt-2 text-xs leading-5 text-text-soft">
              {attachment.kind === "image"
                ? "Image preview is ready. Add a caption below or send it as-is."
                : "Preview card is ready. Full file preview and download will come with storage-backed media persistence."}
            </p>
          </div>
        </div>
        <button
          type="button"
          title="Remove attachment"
          onClick={onClear}
          className="rounded-full border border-border bg-white p-2 text-text-soft transition hover:text-text"
          aria-label="Remove attachment"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getBubblePreviewText(message: Message) {
  if (message.is_deleted) {
    return "This message was deleted";
  }

  const presentation = getMessagePresentation(message);
  return presentation.title || message.content_text || "Message";
}

function formatMessagesForCopy(messages: Message[]) {
  return messages
    .map((message) => {
      const directionLabel =
        message.direction === "outgoing" ? "Outbound" : message.direction === "incoming" ? "Inbound" : "System";

      return `[${new Date(message.sent_at).toLocaleString()}] ${directionLabel}: ${getBubblePreviewText(message)}`;
    })
    .join("\n\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getReplyContext(message: Message, repliedMessage?: Message) {
  if (repliedMessage) {
    return {
      direction: repliedMessage.direction,
      previewText: getBubblePreviewText(repliedMessage)
    };
  }

  const content = asRecord(message.content_json);
  const replyContext = asRecord(content?.replyContext);
  const previewText = typeof replyContext?.previewText === "string" ? replyContext.previewText : null;
  const direction = typeof replyContext?.direction === "string" ? replyContext.direction : null;

  if (!previewText || !direction) {
    return null;
  }

  return {
    direction,
    previewText
  };
}

function MediaPreview({
  messageType,
  previewUrl,
  mimeType,
  fileName
}: {
  messageType: string;
  previewUrl: string;
  mimeType: string | null;
  fileName: string;
}) {
  if (messageType === "image") {
    return <img src={previewUrl} alt={fileName} className="max-h-80 w-full rounded-xl border border-border/80 bg-white object-contain" />;
  }

  if (messageType === "video") {
    return (
      <video controls preload="metadata" className="max-h-80 w-full rounded-xl border border-border/80 bg-black/90">
        <source src={previewUrl} type={mimeType ?? undefined} />
      </video>
    );
  }

  if (messageType === "audio") {
    return (
      <div className="rounded-xl border border-border/80 bg-white p-3">
        <audio controls preload="metadata" className="w-full">
          <source src={previewUrl} type={mimeType ?? undefined} />
        </audio>
      </div>
    );
  }

  const isPdf = mimeType === "application/pdf";

  return (
    <div className="space-y-3">
      {isPdf ? (
        <iframe src={previewUrl} title={fileName} className="h-80 w-full rounded-xl border border-border/80 bg-white" />
      ) : null}
      <a
        href={previewUrl}
        download={fileName}
        className="inline-flex rounded-full border border-border bg-white px-3 py-2 text-xs font-medium text-text-soft transition hover:text-text"
      >
        Download file
      </a>
    </div>
  );
}

function AttachmentPreviewIcon({ kind }: { kind: ComposerAttachment["kind"] }) {
  switch (kind) {
    case "video":
      return <Video className="h-7 w-7 text-text-soft" />;
    case "audio":
      return <AudioLines className="h-7 w-7 text-text-soft" />;
    case "document":
      return <FileText className="h-7 w-7 text-text-soft" />;
    default:
      return <ImageIcon className="h-7 w-7 text-text-soft" />;
  }
}

function extractTemplateVariables(body: string) {
  const matches = body.matchAll(/{{\s*([a-z0-9_]+)\s*}}/gi);
  const keys = new Set<string>();

  for (const match of matches) {
    const key = match[1]?.trim().toLowerCase();
    if (key) {
      keys.add(key);
    }
  }

  return [...keys];
}

function resolveTemplateBody(body: string, values: Record<string, string>) {
  return body.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    return values[key] ?? "";
  });
}

function getTemplateVariableDefault(key: string, conversation?: Conversation) {
  switch (key) {
    case "contact_name":
      return conversation?.contact_name ?? "";
    case "phone_number":
      return conversation?.phone_number_normalized ?? "";
    case "conversation_id":
      return conversation?.id ?? "";
    case "today":
      return new Date().toLocaleDateString("en-MY");
    default:
      return "";
  }
}

function formatTemplateVariableLabel(key: string) {
  return key
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildTemplateVariableDefinitions(reply: QuickReplyItem, conversation?: Conversation) {
  const extractedKeys = extractTemplateVariables(reply.body);
  const savedDefinitions = (reply.variableDefinitions ?? []).map((definition) => ({
    key: definition.key.trim().toLowerCase(),
    default_value: definition.default_value ?? null,
    required: Boolean(definition.required)
  }));
  const savedDefinitionMap = new Map(savedDefinitions.map((definition) => [definition.key, definition]));
  const orderedKeys = [...new Set([...extractedKeys, ...savedDefinitions.map((definition) => definition.key)])];

  return orderedKeys.map((key) => {
    const savedDefinition = savedDefinitionMap.get(key);
    return {
      key,
      default_value: savedDefinition?.default_value ?? getTemplateVariableDefault(key, conversation),
      required: savedDefinition?.required ?? false
    };
  });
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
