import clsx from "clsx";
import { motion } from "framer-motion";
import type { Conversation } from "../types/api";
import { getConversationPreview } from "../lib/messageContent";

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelect
}: {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelect: (conversation: Conversation) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      {conversations.map((conversation) => (
        <motion.button
          key={conversation.id}
          type="button"
          onClick={() => onSelect(conversation)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          whileHover={{ scale: 1.005 }}
          className={clsx(
            "rounded-xl border border-border bg-white p-5 text-left shadow-soft transition duration-200",
            selectedConversationId === conversation.id
              ? "border-primary/30 bg-primary-soft/40"
              : "hover:border-border-strong hover:bg-background-elevated"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-text">{conversation.contact_name}</p>
              <p className="mt-1 text-xs text-text-soft">{conversation.phone_number_normalized ?? "No phone"}</p>
            </div>
            <span className="shrink-0 text-xs text-text-soft">
              {conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleTimeString() : "--"}
            </span>
          </div>
          <p className="mt-3 overflow-hidden text-sm leading-6 text-text-muted">
            {getConversationPreview(conversation.last_message_preview, conversation.last_message_type)}
          </p>
        </motion.button>
      ))}
    </div>
  );
}
