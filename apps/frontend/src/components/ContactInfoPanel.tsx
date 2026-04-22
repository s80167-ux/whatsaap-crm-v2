import { motion } from "framer-motion";
import { useState } from "react";
import type { Conversation } from "../types/api";
import { assignConversation } from "../api/crm";
import { useContact } from "../hooks/useContacts";
import { getStoredUser } from "../lib/auth";
import { Button } from "./Button";
import { Card } from "./Card";

export function ContactInfoPanel({
  className,
  conversation,
  onAssigned
}: {
  className?: string;
  conversation?: Conversation;
  onAssigned?: () => void;
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const currentUser = getStoredUser();
  const { data: contact, isLoading: contactLoading } = useContact(conversation?.contact_id);
  const canAssign = Boolean(currentUser?.organizationUserId && currentUser.permissionKeys.includes("conversations.assign"));
  const isAssignedToCurrentUser = currentUser?.organizationUserId && conversation?.assigned_user_id === currentUser.organizationUserId;
  const isContactAssignedToCurrentUser = currentUser?.organizationUserId && contact?.owner_user_id === currentUser.organizationUserId;

  async function handleAssignToMe() {
    if (!conversation || !currentUser?.organizationUserId) {
      return;
    }

    setIsAssigning(true);
    try {
      await assignConversation({
        conversationId: conversation.id,
        organizationUserId: currentUser.organizationUserId
      });
      onAssigned?.();
    } finally {
      setIsAssigning(false);
    }
  }

  return (
    <Card className={`bg-white ${className ?? ""}`} elevated={false}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Contact</p>
      {conversation ? (
        <div className="mt-2 space-y-2">
          <div>
            <p className="text-base font-semibold text-text truncate">{contact?.display_name ?? conversation.contact_name}</p>
            <p className="text-xs text-text-muted truncate">{contact?.primary_phone_normalized ?? conversation.phone_number_normalized ?? "No normalized number yet"}</p>
            {contact?.primary_phone_e164 ? <p className="mt-1 text-xs text-text-soft">{contact.primary_phone_e164}</p> : null}
          </div>
          <div className="rounded-lg border border-border bg-background-tint p-2 mt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Canonical</p>
            {contactLoading ? (
              <p className="mt-2 text-sm leading-6 text-text-muted">Loading canonical contact details...</p>
            ) : (
              <div className="mt-1 space-y-1 text-xs leading-5 text-text-muted">
                <p>ID: {conversation.contact_id}</p>
                <p>Owner: {contact?.owner_user_id ? (isContactAssignedToCurrentUser ? "You" : contact.owner_user_id) : "Unassigned"}</p>
                <p>Phone: {contact?.primary_phone_e164 ?? "--"}</p>
                <p>Norm: {contact?.primary_phone_normalized ?? "--"}</p>
              </div>
            )}
          </div>
          {canAssign ? (
            <div className="rounded-lg border border-border bg-background-tint p-2 mt-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Assignment</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {isAssignedToCurrentUser ? "Assigned to you." : "Assign to yourself."}
              </p>
              <Button
                className="mt-2 w-full !py-1 !text-xs"
                variant={isAssignedToCurrentUser ? "secondary" : "primary"}
                onClick={handleAssignToMe}
                disabled={isAssigning || Boolean(isAssignedToCurrentUser)}
              >
                {isAssignedToCurrentUser ? "Assigned" : isAssigning ? "Assigning..." : "Assign"}
              </Button>
            </div>
          ) : null}
          {/* Remove stability guarantees for compact mode */}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-text-muted">
          Select a thread to inspect contact details.
        </p>
      )}
    </Card>
  );
}
