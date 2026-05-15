import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AudioLines,
  Check,
  Copy,
  Paperclip,
  Smile,
  Sparkles,
  X,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Forward,
  BriefcaseBusiness,
  Reply,
  Trash2,
  Video
} from "lucide-react";
import type { Conversation, Message, OutboundAttachmentInput, QuickReplyVariableDefinition } from "../types/api";
import { deleteMessage, forwardMessage, recordQuickReplyUsage, retryOutboundMessage, sendMessage } from "../api/crm";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { getMessagePresentation } from "../lib/messageContent";
import {
  markMessagesDeletedInCache,
  patchConversationFromMessageInCache,
  replaceOptimisticMessageInCache,
  updateMessageAckInCache,
  upsertMessageInCache
} from "../lib/inboxCache";
import { useQuickReplies } from "../hooks/useQuickReplies";
import { useSalesOrders } from "../hooks/useSales";
import { useIsMobileViewport } from "../hooks/useMediaQuery";
import { getStoredUser } from "../lib/auth";
import { Button } from "./Button";
import { Card } from "./Card";
import { PopupOverlay } from "./PopupOverlay";
import { Toast } from "./Toast";
import {
  InsertMessageModal,
  matchesInsertMessageTemplateSearch,
  matchesInsertMessageVariableSearch,
  type InsertMessageAiAction,
  type InsertMessageTemplate,
  type InsertMessageVariable
} from "./composer/InsertMessageModal";
import { SlashSuggestionMenu, type SlashSuggestionItem } from "./composer/SlashSuggestionMenu";

const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;
const INITIAL_VISIBLE_MESSAGES = 12;
const LOAD_OLDER_MESSAGES_STEP = 12;
const EMOJI_CHOICES = ["😊", "👍", "🙏", "✅", "🔥", "🎉", "📌", "📞", "💬", "🚚", "💳", "✨"];
const MAX_SLASH_SUGGESTIONS = 8;
const AI_ACTIONS: InsertMessageAiAction[] = [
  {
    id: "rewrite_professional",
    title: "Rewrite professionally",
    description: "Refine the current draft into a more polished customer-facing response.",
    disabled: true,
    keywords: ["rewrite", "professional", "tone"]
  },
  {
    id: "shorten_message",
    title: "Shorten message",
    description: "Trim the current draft while keeping the meaning intact.",
    disabled: true,
    keywords: ["shorten", "concise", "brief"]
  },
  {
    id: "translate_message",
    title: "Translate message",
    description: "Translate the draft into the preferred customer language.",
    disabled: true,
    keywords: ["translate", "language"]
  },
  {
    id: "generate_follow_up",
    title: "Generate follow-up",
    description: "Generate the next best follow-up based on the conversation context.",
    disabled: true,
    keywords: ["follow-up", "generate", "next step"]
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

const COMPOSER_SLASH_QUERY_PATTERN = /(^|\s)\/([a-zA-Z0-9-_]*)$/;

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
      return "text-success bg-success/10 border-success/20";
    case "device_delivered":
    case "played":
      return "text-primary bg-primary/10 border-primary/20";
    case "server_ack":
      return "text-muted-foreground bg-muted border-border";
    case "failed":
      return "text-destructive bg-destructive/10 border-destructive/20";
    case "pending":
    case "queued":
    default:
      return "text-warning bg-warning/10 border-warning/20";
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
  organizationId
}: {
  conversation?: Conversation;
  conversations: Conversation[];
  messages: Message[];
  historyRangeLabel: string;
  organizationId?: string | null;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const isMobile = useIsMobileViewport();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRetryingOutbound, setIsRetryingOutbound] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [isInsertMessageOpen, setIsInsertMessageOpen] = useState(false);
  const [insertMessageInitialSearch, setInsertMessageInitialSearch] = useState("");
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<TemplatePreviewState | null>(null);
  const [selectedQuickReplyTemplateId, setSelectedQuickReplyTemplateId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraftState | null>(null);
  const [forwardSourceMessage, setForwardSourceMessage] = useState<Message | null>(null);
  const [forwardTargetConversationId, setForwardTargetConversationId] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [createSalesMessage, setCreateSalesMessage] = useState<Message | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_VISIBLE_MESSAGES);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const slashInsertionBaseRef = useRef<string | null>(null);
  const latestOutgoingMessage = [...messages].reverse().find((message) => message.direction === "outgoing");
  const latestOutgoingStatus = latestOutgoingMessage?.ack_status;
  const latestOutgoingStatusLabel = formatAckStatus(latestOutgoingStatus);
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const forwardableConversations = conversations.filter((item) => item.id !== conversation?.id);
  const selectedMessages = selectedMessageIds.map((messageId) => messagesById.get(messageId)).filter((message): message is Message => Boolean(message));
  const visibleMessages = useMemo(
    () => messages.slice(Math.max(0, messages.length - visibleMessageCount)),
    [messages, visibleMessageCount]
  );
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);
  const latestVisibleMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? null;
  const { toast: copyToast, copyText } = useCopyFeedback();
  const resolvedOrganizationId = organizationId ?? (conversation as (Conversation & { organization_id?: string | null }) | undefined)?.organization_id ?? null;
  const { data: organizationQuickReplies = [], isLoading: quickRepliesLoading } = useQuickReplies({
    organizationId: resolvedOrganizationId,
    enabled: Boolean(conversation)
  });
  const { data: salesOrders = [] } = useSalesOrders({
    organizationId: resolvedOrganizationId,
    enabled: Boolean(conversation && resolvedOrganizationId)
  });
  const canManageTemplates = Boolean(
    currentUser?.role === "super_admin" || currentUser?.permissionKeys.includes("org.manage_settings")
  );

  const salesByMessageId = useMemo(
    () =>
      new Map(
        salesOrders
          .filter((order) => order.source_message_id)
          .map((order) => [order.source_message_id, order])
      ),
    [salesOrders]
  );
  const quickReplies: QuickReplyItem[] = organizationQuickReplies.length > 0
    ? organizationQuickReplies.map((template) => ({
        id: template.id,
        title: template.title,
        body: template.body,
        category: template.category,
        variableDefinitions: template.variable_definitions ?? [],
        isOrganizationTemplate: true
      }))
    : [];
  const insertVariables = useMemo<InsertMessageVariable[]>(() => {
    const items: InsertMessageVariable[] = [
      {
        id: "contact_name",
        label: "Contact Name",
        value: "{{contact_name}}",
        keywords: ["customer", "name"]
      },
      {
        id: "company_name",
        label: "Company Name",
        value: "{{company_name}}",
        keywords: ["business", "organization", "company"]
      },
      {
        id: "today",
        label: "Today",
        value: "{{today}}",
        keywords: ["date", "current date"]
      }
    ];

    if (conversation?.phone_number_normalized) {
      items.splice(1, 0, {
        id: "phone_number",
        label: "Phone Number",
        value: "{{phone_number}}",
        keywords: ["contact", "phone", "mobile"]
      });
    }

    return items;
  }, [conversation?.phone_number_normalized]);
  const insertTemplates = useMemo<InsertMessageTemplate[]>(() => {
    return quickReplies.map((reply) => ({
      id: reply.id,
      title: reply.title,
      category: reply.category ?? "Uncategorized",
      content: reply.body,
      preview: reply.body,
      keywords: [reply.category ?? "template", "approved", "organization"]
    }));
  }, [quickReplies]);
  const slashTemplateMatches = useMemo(() => {
    const normalizedSlashQuery = slashQuery.trim().toLowerCase();
    return insertTemplates.filter((item) => matchesInsertMessageTemplateSearch(item, normalizedSlashQuery));
  }, [insertTemplates, slashQuery]);
  const slashVariableMatches = useMemo(() => {
    const normalizedSlashQuery = slashQuery.trim().toLowerCase();
    return insertVariables.filter((item) => matchesInsertMessageVariableSearch(item, normalizedSlashQuery));
  }, [insertVariables, slashQuery]);
  const slashSuggestions = useMemo<SlashSuggestionItem[]>(() => {
    if (!isSlashMenuOpen) {
      return [];
    }

    const templateSuggestions: SlashSuggestionItem[] = slashTemplateMatches
      .map((template) => ({
        id: `template:${template.id}`,
        kind: "template",
        title: template.title,
        subtitle: template.category,
        preview: template.preview ?? template.content,
        template
      }));
    const variableSuggestions: SlashSuggestionItem[] = slashVariableMatches
      .map((variable) => ({
        id: `variable:${variable.id}`,
        kind: "variable",
        title: variable.label,
        subtitle: "Variable",
        preview: variable.value,
        variable
      }));

    return [...templateSuggestions, ...variableSuggestions].slice(0, MAX_SLASH_SUGGESTIONS);
  }, [isSlashMenuOpen, slashTemplateMatches, slashVariableMatches]);
  const hasMoreSlashMatches = slashTemplateMatches.length + slashVariableMatches.length > slashSuggestions.length;

  async function handleSend() {
    if (!conversation || (!text.trim() && !attachment)) {
      return;
    }

    const resolvedText = resolveComposerBody(text, conversation).trim();

    if (!resolvedText && !attachment) {
      return;
    }

    if (!resolvedOrganizationId) {
      setSendNotice("Organization not set. Please refresh.");
      return;
    }

    setIsSending(true);
    setSendNotice(null);
    setText("");
    setAttachment(null);
    setSelectedQuickReplyTemplateId(null);
    setReplyDraft(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const optimisticId = `optimistic-${conversation.id}-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      organization_id: resolvedOrganizationId,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      whatsapp_account_id: conversation.whatsapp_account_id,
      external_message_id: optimisticId,
      external_chat_id: conversation.external_thread_key ?? null,
      reply_to_message_id: replyDraft?.messageId ?? null,
      direction: "outgoing",
      message_type: attachment?.kind ?? "text",
      content_text: resolvedText || attachment?.fileName || null,
      content_json: null,
      sent_at: new Date().toISOString(),
      ack_status: "pending"
    };

    upsertMessageInCache(queryClient, optimisticMessage);
    patchConversationFromMessageInCache(queryClient, optimisticMessage);

    try {
      const response = await sendMessage({
        whatsappAccountId: conversation.whatsapp_account_id,
        conversationId: conversation.id,
        organizationId: resolvedOrganizationId,
        quickReplyTemplateId: selectedQuickReplyTemplateId,
        replyToMessageId: replyDraft?.messageId ?? null,
        text: resolvedText || undefined,
        attachment
      });

      if (response.data) {
        replaceOptimisticMessageInCache(queryClient, optimisticMessage.id, response.data);
        patchConversationFromMessageInCache(queryClient, response.data);
      }

      setSendNotice("Message queued for delivery. The latest bubble will update as dispatch and ack events arrive.");
    } catch (error) {
      updateMessageAckInCache(queryClient, conversation.id, optimisticMessage.id, "failed");
      setSendNotice(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setIsSending(false);
    }
  }


  async function handleRetryLatestOutbound() {
  if (!latestOutgoingMessage) return;

  const confirmed = window.confirm("Retry sending this pending outbound message?");
  if (!confirmed) return;

  setIsRetryingOutbound(true);
  setSendNotice("Retrying pending outbound message...");

  try {
        await retryOutboundMessage({
        messageId: latestOutgoingMessage.id,
        organizationId: resolvedOrganizationId
      });

    updateMessageAckInCache(queryClient, latestOutgoingMessage.conversation_id, latestOutgoingMessage.id, "queued");
    setSendNotice("Retry requested. Message will update shortly.");
  } catch (error) {
    setSendNotice(error instanceof Error ? error.message : "Retry failed");
  } finally {
    setIsRetryingOutbound(false);
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

  function buildComposerText(base: string, value: string) {
    const needsSpace = base.length > 0 && !base.endsWith(" ") && !value.startsWith(" ");
    return `${base}${needsSpace ? " " : ""}${value}`;
  }

  function stripTrailingSlashQuery(value: string) {
    return value.replace(COMPOSER_SLASH_QUERY_PATTERN, (_, prefix: string) => prefix);
  }

  function closeSlashMenu() {
    setIsSlashMenuOpen(false);
    setSlashQuery("");
    setSelectedSlashIndex(0);
  }

  function insertComposerText(value: string) {
    setSelectedQuickReplyTemplateId(null);
    setText((current) => {
      return buildComposerText(current, value);
    });
    textareaRef.current?.focus();
  }

  function handleComposerChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;

    setText(value);

    const slashMatch = value.match(COMPOSER_SLASH_QUERY_PATTERN);

    if (slashMatch) {
      setSlashQuery(slashMatch[2] ?? "");
      setSelectedSlashIndex(0);
      setIsSlashMenuOpen(true);
      return;
    }

    closeSlashMenu();
  }

  function closeInsertMessageModal() {
    setIsInsertMessageOpen(false);
    setInsertMessageInitialSearch("");
  }

  function openInsertMessageModal(search = "") {
    setInsertMessageInitialSearch(search);
    setIsInsertMessageOpen(true);
  }

  function handleSlashKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSend();
      return;
    }

    if (!isSlashMenuOpen) {
      return;
    }

    if (event.key === "ArrowDown") {
      if (slashSuggestions.length === 0) {
        return;
      }

      event.preventDefault();
      setSelectedSlashIndex((current) => (current + 1) % slashSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (slashSuggestions.length === 0) {
        return;
      }

      event.preventDefault();
      setSelectedSlashIndex((current) => (current - 1 + slashSuggestions.length) % slashSuggestions.length);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSlashMenu();
      return;
    }

    if (event.key === "Enter") {
      const item = slashSuggestions[selectedSlashIndex];

      if (!item) {
        return;
      }

      event.preventDefault();
      handleSelectSlashSuggestion(item);
    }
  }

  function insertVariable(variable: InsertMessageVariable) {
    insertComposerText(resolveComposerVariableValue(variable.id, conversation) ?? variable.value);
    closeInsertMessageModal();
  }

  function closeComposerPopups() {
    closeInsertMessageModal();
    closeSlashMenu();
    setIsEmojiOpen(false);
    setTemplatePreview(null);
    slashInsertionBaseRef.current = null;
  }

  function commitSlashVariable(variable: InsertMessageVariable) {
    setSelectedQuickReplyTemplateId(null);
    setText((current) => {
      const base = stripTrailingSlashQuery(current);
      const resolvedValue = resolveComposerVariableValue(variable.id, conversation) ?? variable.value;
      return buildComposerText(base, resolvedValue);
    });
    closeSlashMenu();
    textareaRef.current?.focus();
  }

  function handleSelectSlashSuggestion(item: SlashSuggestionItem) {
    if (item.kind === "variable") {
      commitSlashVariable(item.variable);
      return;
    }

    slashInsertionBaseRef.current = stripTrailingSlashQuery(text);
    closeSlashMenu();
    handleSelectInsertTemplate(item.template);
  }

  function handleBrowseAllSlashMatches() {
    closeSlashMenu();
    openInsertMessageModal(slashQuery);
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
      await deleteMessage({ messageId: message.id, organizationId: resolvedOrganizationId });
      markMessagesDeletedInCache(queryClient, message.conversation_id, [message.id]);
      patchConversationFromMessageInCache(queryClient, { ...message, is_deleted: true }, { deleted: true });
      if (replyDraft?.messageId === message.id) {
        setReplyDraft(null);
      }
      setSendNotice("Chat bubble deleted from this conversation.");
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
      await Promise.all(
        deletableMessages.map(async (message) =>
          deleteMessage({ messageId: message.id, organizationId: resolvedOrganizationId })
        )
      );
      const bulkConversationId = deletableMessages[0]?.conversation_id;
      if (bulkConversationId) {
        markMessagesDeletedInCache(
          queryClient,
          bulkConversationId,
          deletableMessages.map((message) => message.id)
        );
      }
      deletableMessages.forEach((message) => {
        patchConversationFromMessageInCache(queryClient, { ...message, is_deleted: true }, { deleted: true });
      });
      if (replyDraft && deletableMessages.some((message) => message.id === replyDraft.messageId)) {
        setReplyDraft(null);
      }
      clearSelectedMessages();
      setSendNotice(
        deletableMessages.length === 1
          ? "Selected chat bubble deleted from this conversation."
          : `${deletableMessages.length} chat bubbles deleted from this conversation.`
      );
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
      const response = await forwardMessage({
        messageId: forwardSourceMessage.id,
        targetConversationId: forwardTargetConversationId,
        organizationId: resolvedOrganizationId
      });
      if (response.data) {
        upsertMessageInCache(queryClient, response.data);
        patchConversationFromMessageInCache(queryClient, response.data);
      }
      setForwardSourceMessage(null);
      setForwardTargetConversationId("");
      setSendNotice("Chat bubble forwarded to the selected contact.");
    } catch (error) {
      setSendNotice(error instanceof Error ? error.message : "Unable to forward message");
    } finally {
      setIsForwarding(false);
    }
  }

  function commitQuickReply(reply: QuickReplyItem, body: string) {
    const slashInsertionBase = slashInsertionBaseRef.current;

    setText(slashInsertionBase === null ? body : buildComposerText(slashInsertionBase, body));
    setSelectedQuickReplyTemplateId(reply.isOrganizationTemplate ? reply.id : null);
    slashInsertionBaseRef.current = null;
    closeInsertMessageModal();
    setTemplatePreview(null);
    textareaRef.current?.focus();

    if (reply.isOrganizationTemplate) {
      void recordQuickReplyUsage({
        templateId: reply.id,
        organizationId: resolvedOrganizationId,
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
    closeInsertMessageModal();
  }

  function handleSelectInsertTemplate(template: InsertMessageTemplate) {
    const quickReply = quickReplies.find((item) => item.id === template.id);

    if (quickReply) {
      applyQuickReply(quickReply);
      return;
    }

    applyQuickReply({
      id: template.id,
      title: template.title,
      body: template.content,
      category: template.category,
      isOrganizationTemplate: false
    });
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
    setVisibleMessageCount(INITIAL_VISIBLE_MESSAGES);
    closeSlashMenu();
    slashInsertionBaseRef.current = null;
  }, [conversation?.id]);

  useEffect(() => {
    if (!isSlashMenuOpen) {
      return;
    }

    setSelectedSlashIndex((current) => Math.min(current, Math.max(slashSuggestions.length - 1, 0)));
  }, [isSlashMenuOpen, slashSuggestions.length]);

  useEffect(() => {
    setSelectedMessageIds((current) => current.filter((messageId) => messagesById.has(messageId)));
  }, [messages]);

  useEffect(() => {
    if (!conversation?.id) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      if (isMobile) {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        return;
      }

      const messageScrollElement = messageScrollRef.current;
      if (messageScrollElement) {
        messageScrollElement.scrollTo({
          top: messageScrollElement.scrollHeight,
          behavior: "smooth"
        });
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [conversation?.id, isMobile, latestVisibleMessageId]);

  if (!conversation) {
    return (
      <Card className="workspace-block flex min-h-[420px] items-center justify-center p-10" elevated>
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
    <Card className={`workspace-block min-w-0 overflow-hidden p-0 ${isMobile ? "flex flex-col" : "grid min-h-[780px] max-h-[calc(100vh-4.5rem)] grid-rows-[auto,1fr,auto]"}`} elevated>
      <header className="border-b border-border bg-card px-4 py-4 sm:px-6 sm:py-5 xl:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">Live conversation</p>
            <p className="mt-2 truncate text-xl font-semibold text-text">{conversation.contact_name}</p>
            <p className="mt-1 text-sm text-text-muted">{conversation.phone_number_normalized ?? "No phone available"}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {conversation.whatsapp_account_label ?? "WhatsApp account"}
            </span>
            {conversation.unread_count > 0 ? (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                {conversation.unread_count} unread
              </span>
            ) : null}
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                conversation.assigned_user_id
                  ? "border-success/20 bg-success/10 text-success"
                  : "border-warning/20 bg-warning/10 text-warning"
              }`}
            >
              {conversation.assigned_user_id ? "Assigned" : "Unassigned"}
            </span>
            {conversation.has_sales || conversation.has_sales_lead_tag ? (
              <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                Sales context
              </span>
            ) : null}
          </div>
        </div>
        {latestOutgoingStatusLabel ? (
  <div className="mt-3 flex flex-wrap items-center gap-2">
    <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-soft">
      Latest outbound
    </span>

    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getAckTone(latestOutgoingStatus)}`}>
      {latestOutgoingStatusLabel}
    </span>

    {["pending", "failed"].includes(latestOutgoingStatus ?? "") && (
      <button
        onClick={() => handleRetryLatestOutbound()}
        disabled={isRetryingOutbound}
        className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning hover:bg-warning/20 disabled:opacity-60"
      >
        {isRetryingOutbound ? "Retrying..." : "Retry"}
      </button>
    )}
  </div>
) : null}
        {sendNotice ? <p className="mt-2 text-xs text-text-soft">{sendNotice}</p> : null}
      </header>
        <div
          ref={messageScrollRef}
          className={`min-h-0 space-y-4 bg-background-elevated px-3 py-4 sm:px-4 sm:py-5 xl:px-5 2xl:px-7 ${isMobile ? "overflow-visible pb-6" : "overflow-y-auto"}`}
        >
        {selectedMessages.length > 0 ? (
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-card/95 px-4 py-3 shadow-panel backdrop-blur">
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
        {hiddenMessageCount > 0 ? (
          <div className="sticky top-0 z-[1] flex justify-center">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full border border-border bg-card/90 px-3.5 py-1 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur hover:border-primary/20 hover:bg-card hover:text-primary"
              onClick={() => setVisibleMessageCount((current) => Math.min(messages.length, current + LOAD_OLDER_MESSAGES_STEP))}
            >
              {Math.min(hiddenMessageCount, LOAD_OLDER_MESSAGES_STEP)} earlier messages
            </Button>
          </div>
        ) : null}
        {messages.length > 0 ? (
          visibleMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              repliedMessage={message.reply_to_message_id ? messagesById.get(message.reply_to_message_id) : undefined}
              linkedSalesOrderId={salesByMessageId.get(message.id)?.id ?? null}
              isDeleting={deletingMessageId === message.id}
              isSelected={selectedMessageIds.includes(message.id)}
              onReply={handleReplyToMessage}
              onForward={handleOpenForwardPicker}
              onCopy={handleCopyMessage}
              onDelete={handleDeleteMessage}
              onToggleSelection={handleToggleMessageSelection}
              onCreateSales={setCreateSalesMessage}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card/80 px-5 py-8 text-center text-sm leading-6 text-muted-foreground">
            No chat history found in {historyRangeLabel.toLowerCase()}.
          </div>
        )}
        <div ref={messageEndRef} aria-hidden="true" />
      </div>
      <footer className="border-t border-primary/10 bg-muted/80 px-3 py-3 sm:px-4 xl:px-5 2xl:px-7">
        {replyDraft ? (
          <div className="mb-3 rounded-2xl border border-primary/15 bg-primary/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Replying to bubble</p>
                <p className="mt-1 line-clamp-2 text-sm text-text">{replyDraft.previewText}</p>
              </div>
              <button
                type="button"
                title="Cancel reply"
                onClick={() => setReplyDraft(null)}
                className="rounded-full border border-border bg-card p-2 text-muted-foreground transition hover:text-foreground"
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
        <div className="app-card space-y-3 rounded-[18px] p-3 shadow-panel">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/*,text/*"
            onChange={handleAttachmentChange}
            title="Attach a file"
          />
          <div className="grid grid-cols-4 gap-1.5 sm:hidden">
            <Button
              type="button"
              variant="ghost"
              title="Attach a file"
              aria-label="Attach a file"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-2 text-primary hover:bg-primary-soft/50"
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
              className="h-10 px-2 text-primary hover:bg-primary-soft/50"
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              title={isInsertMessageOpen ? "Close insert into message" : "Open insert into message"}
              aria-label={isInsertMessageOpen ? "Close insert into message" : "Open insert into message"}
              onClick={() => {
                const shouldOpen = !isInsertMessageOpen;
                closeComposerPopups();
                if (shouldOpen) {
                  openInsertMessageModal();
                  return;
                }

                closeInsertMessageModal();
              }}
              className="h-10 px-2 text-primary hover:bg-primary-soft/50"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <SlashSuggestionMenu
                open={isSlashMenuOpen}
                items={slashSuggestions}
                selectedIndex={selectedSlashIndex}
                onSelect={handleSelectSlashSuggestion}
                onSelectIndex={setSelectedSlashIndex}
                footerActionLabel={hasMoreSlashMatches ? "Browse all matches" : undefined}
                onFooterAction={hasMoreSlashMatches ? handleBrowseAllSlashMatches : undefined}
              />
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleComposerChange}
                onBlur={() => closeSlashMenu()}
                onFocus={() => {
                  if (!text.trim()) {
                    setSelectedQuickReplyTemplateId(null);
                  }
                }}
                onKeyDown={handleSlashKeyDown}
                placeholder={attachment ? "Add an optional caption..." : "Type a reply..."}
                rows={isMobile ? 2 : 3}
                className="min-h-[72px] w-full resize-y rounded-xl border-2 border-border bg-input px-4 py-3 text-[15px] leading-6 text-foreground shadow-soft outline-none transition focus:border-primary focus:bg-card focus:ring-2 focus:ring-ring/15 sm:min-h-[92px]"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="hidden items-center gap-2 sm:flex">
              <Button
                type="button"
                variant="ghost"
                title="Attach a file"
                aria-label="Attach a file"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 px-3 text-primary hover:bg-primary-soft/50"
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
                className="h-10 px-3 text-primary hover:bg-primary-soft/50"
              >
                <Smile className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                title={isInsertMessageOpen ? "Close insert into message" : "Open insert into message"}
                aria-label={isInsertMessageOpen ? "Close insert into message" : "Open insert into message"}
                onClick={() => {
                  const shouldOpen = !isInsertMessageOpen;
                  closeComposerPopups();
                  if (shouldOpen) {
                    openInsertMessageModal();
                    return;
                  }

                  closeInsertMessageModal();
                }}
                className="h-10 gap-2 px-3 text-primary hover:bg-primary-soft/50"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden text-xs font-semibold lg:inline">Insert</span>
              </Button>
            </div>
              <Button onClick={handleSend} disabled={isSending || (!text.trim() && !attachment)} className="h-11 w-full rounded-xl px-6 sm:min-w-[112px] sm:w-auto">
              {isSending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-text-soft">
          {isMobile
            ? "Tap Send to queue the message."
            : "Use Ctrl+Enter to send. Current outbound media path supports one attachment up to 4 MB through the live queue and connector flow."}
        </p>
      </footer>
      <InsertMessageModal
        open={isInsertMessageOpen}
        initialSearch={insertMessageInitialSearch}
        onClose={closeInsertMessageModal}
        variables={insertVariables}
        templates={insertTemplates}
        aiActions={AI_ACTIONS}
        loadingTemplates={quickRepliesLoading}
        templateEmptyMessage={
          resolvedOrganizationId
            ? canManageTemplates
              ? "No organization templates yet. Create and activate them in the template library to show them here."
              : "No organization templates are available yet. Ask a manager to create and activate them in the template library."
            : "No organization selected for this conversation, so templates are unavailable."
        }
        templateEmptyActionLabel={canManageTemplates && resolvedOrganizationId ? "Open template library" : undefined}
        onTemplateEmptyAction={
          canManageTemplates && resolvedOrganizationId
            ? () => {
                closeInsertMessageModal();
                navigate("/inbox/replies");
              }
            : undefined
        }
        onSelectVariable={insertVariable}
        onSelectTemplate={handleSelectInsertTemplate}
      />
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
        onClose={() => {
          setTemplatePreview(null);
          slashInsertionBaseRef.current = null;
        }}
        title="Template preview"
        description="Review variables before inserting this template into the composer."
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
                      className="h-10 w-full rounded-xl border border-border bg-input px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/30"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="border border-border bg-background-tint p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Resolved message</p>
              <div className="mt-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-6 text-foreground">
                {resolveTemplateBody(templatePreview.reply.body, templatePreview.values)}
              </div>
              {missingRequiredPreviewVariables.length > 0 ? (
                <p className="mt-3 text-xs leading-5 text-warning">
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
            <div className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
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
                      ? "border-primary/30 bg-primary/15 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="block text-sm font-semibold">{item.contact_name}</span>
                  <span className="mt-1 block text-xs text-inherit">{item.phone_number_normalized ?? "No phone available"}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-muted px-4 py-5 text-sm text-muted-foreground">
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
  linkedSalesOrderId,
  isDeleting,
  isSelected,
  onReply,
  onForward,
  onCopy,
  onDelete,
  onToggleSelection,
  onCreateSales
}: {
  message: Message;
  repliedMessage?: Message;
  linkedSalesOrderId?: string | null;
  isDeleting: boolean;
  isSelected: boolean;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (message: Message) => void;
  onDelete: (message: Message) => void;
  onToggleSelection: (message: Message) => void;
  onCreateSales: (message: Message) => void;
}) {
  const presentation = getMessagePresentation(message);
  const Icon = getMessageTypeIcon(message.message_type);
  const replyContext = getReplyContext(message, repliedMessage);
  const isDeleted = Boolean(message.is_deleted);
  const showSelectionActions = !isDeleted;
  // Show reply/forward for both incoming and outgoing (if not deleted)
  const showBubbleActions = (message.direction === "outgoing" || message.direction === "incoming") && !isDeleted;

  function openLinkedSalesOrder() {
    if (!linkedSalesOrderId) {
      return;
    }

    window.location.href = `/sales?order_id=${linkedSalesOrderId}&section=order-detail`;
  }

  return (
    <div className={`flex flex-col ${message.direction === "outgoing" ? "items-end" : "items-start"}`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={`max-w-[96%] rounded-2xl px-4 py-3.5 text-sm shadow-[0_10px_24px_rgba(20,32,51,0.06)] xl:max-w-[90%] 2xl:max-w-[85%] ${
          message.direction === "outgoing"
            ? isDeleted
              ? "ml-auto border border-border/70 bg-muted text-muted-foreground"
              : "ml-auto border border-secondary/15 bg-secondary-soft/80 text-text"
            : isDeleted
              ? "border border-border/70 bg-muted text-muted-foreground"
              : "border border-border/90 bg-card text-text"
        }`}
      >
        {replyContext ? (
          <div className="mb-3 rounded-xl border border-border/80 bg-card/80 px-3 py-2">
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
                          className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-text-soft"
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
        {linkedSalesOrderId ? (
          <button
            type="button"
            title="Open linked sales order"
            onClick={openLinkedSalesOrder}
            className="mt-3 inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success transition hover:border-success/30 hover:bg-success/15"
          >
            💼 Sales Created
          </button>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-soft">
          <p>{new Date(message.sent_at).toLocaleString()}</p>
          {message.direction === "outgoing" && !isDeleted ? (
            <span className={`rounded-full border px-2 py-1 font-medium ${getAckTone(message.ack_status)}`}>
              {formatAckStatus(message.ack_status) ?? "Queued"}
            </span>
          ) : null}
        </div>
        {message.direction === "outgoing" && !isDeleted && message.ack_status === "failed" ? (
          <p className="mt-2 text-xs leading-5 text-destructive">
            Delivery failed on the last attempt. The outbox worker may retry automatically based on backend policy.
          </p>
        ) : null}
        {message.direction === "outgoing" && !isDeleted && (message.ack_status === "pending" || !message.ack_status) ? (
          <p className="mt-2 text-xs leading-5 text-warning">
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
            label={linkedSalesOrderId ? "Open linked sales order" : "Create sales from bubble"}
            onClick={() => {
              if (linkedSalesOrderId) {
                openLinkedSalesOrder();
                return;
              }
              onCreateSales(message);
            }}
            icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}
            active={Boolean(linkedSalesOrderId)}
          />
          {showBubbleActions ? (
            <>
              <BubbleActionButton
                label="Reply to bubble"
                onClick={() => onReply(message)}
                icon={<Reply className="h-3.5 w-3.5" />}
              />
              <BubbleActionButton
                label="Forward bubble"
                onClick={() => onForward(message)}
                icon={<Forward className="h-3.5 w-3.5" />}
              />
            </>
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
  // Special style for tick icon when active for higher contrast
  const isTick = label === "Tick bubble" || label === "Untick bubble";
  const buttonClass = isTick && active
    ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary bg-primary text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
    : `inline-flex h-7 w-7 items-center justify-center rounded-full border bg-card transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-primary/35 bg-primary/10 text-primary"
          : "border-border text-text-soft hover:border-primary/30 hover:text-primary"
      }`;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={buttonClass}
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
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
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
          className="rounded-full border border-border bg-card p-2 text-text-soft transition hover:text-text"
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
    return <img src={previewUrl} alt={fileName} className="max-h-80 w-full rounded-xl border border-border/80 bg-card object-contain" />;
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
      <div className="rounded-xl border border-border/80 bg-card p-3">
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
        <iframe src={previewUrl} title={fileName} className="h-80 w-full rounded-xl border border-border/80 bg-card" />
      ) : null}
      <a
        href={previewUrl}
        download={fileName}
        className="inline-flex rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-text-soft transition hover:text-text"
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

function resolveComposerBody(body: string, conversation?: Conversation) {
  return body.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    return resolveComposerVariableValue(key, conversation) ?? match;
  });
}

function resolveComposerVariableValue(key: string, conversation?: Conversation) {
  const normalizedKey = key.trim().toLowerCase();
  const value = getTemplateVariableDefault(normalizedKey, conversation).trim();
  return value ? value : null;
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
