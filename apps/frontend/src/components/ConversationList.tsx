import clsx from "clsx";
import { motion } from "framer-motion";
import type { Conversation } from "../types/api";
import { getConversationPreview } from "../lib/messageContent";
import { PanelPagination, usePanelPagination } from "./PanelPagination";

function getConversationSourceLabel(conversation: Conversation) {
  return conversation.whatsapp_account_label ?? conversation.whatsapp_account_id ?? "Unknown connection";
}

function formatConversationTimestamp(value: string | null) {
  if (!value) {
    return "--";
  }

  const timestamp = new Date(value);
  const now = new Date();
  const isSameDay =
    timestamp.getFullYear() === now.getFullYear() &&
    timestamp.getMonth() === now.getMonth() &&
    timestamp.getDate() === now.getDate();

  return isSameDay
    ? timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : timestamp.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelect
}: {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelect: (conversation: Conversation) => void;
}) {
  const conversationsPagination = usePanelPagination(conversations);

  return (
    <div className="flex min-h-0 flex-col gap-3 pr-1">
      {conversationsPagination.visibleItems.map((conversation) => (
        <motion.button
          key={conversation.id}
          type="button"
          onClick={() => onSelect(conversation)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          whileHover={{ scale: 1.005 }}
          className={clsx(
            "conversation-item",
            selectedConversationId === conversation.id && "conversation-item-active"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-text">{conversation.contact_name}</p>
              <p className="mt-1 text-xs text-text-soft">{conversation.phone_number_normalized ?? "No phone"}</p>
              <p className="mt-2 inline-flex max-w-full items-center rounded-full border border-border bg-background-tint px-2 py-1 text-[11px] font-medium leading-none text-text-muted">
                <span className="truncate">{getConversationSourceLabel(conversation)}</span>
              </p>
            </div>
            <span className="shrink-0 text-xs text-text-soft">
              {formatConversationTimestamp(conversation.last_message_at)}
            </span>
          </div>
          <p className="mt-3 overflow-hidden text-sm leading-6 text-text-muted">
            {getConversationPreview(conversation.last_message_preview, conversation.last_message_type)}
          </p>
        </motion.button>
      ))}
      <PanelPagination
        page={conversationsPagination.page}
        pageCount={conversationsPagination.pageCount}
        totalItems={conversationsPagination.totalItems}
        onPageChange={conversationsPagination.setPage}
      />
    </div>
  );
}
