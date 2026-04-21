import { motion } from "framer-motion";
import { useState } from "react";
import type { Conversation } from "../types/api";
import { assignConversation } from "../api/crm";
import { useContact } from "../hooks/useContacts";
import { getStoredUser } from "../lib/auth";
import { Button } from "./Button";
import { Card } from "./Card";

export function ContactInfoPanel({
  conversation,
  onAssigned
}: {
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
    <Card className="bg-white xl:max-h-[calc(100vh-9.5rem)] xl:overflow-auto" elevated>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Contact</p>
      {conversation ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-lg font-semibold text-text">{contact?.display_name ?? conversation.contact_name}</p>
            <p className="text-sm text-text-muted">{contact?.primary_phone_normalized ?? conversation.phone_number_normalized ?? "No normalized number yet"}</p>
            {contact?.primary_phone_e164 ? <p className="mt-1 text-xs text-text-soft">{contact.primary_phone_e164}</p> : null}
          </div>
          <div className="rounded-xl border border-border bg-background-tint p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Canonical record</p>
            {contactLoading ? (
              <p className="mt-2 text-sm leading-6 text-text-muted">Loading canonical contact details...</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm leading-6 text-text-muted">
                <p>Contact ID: {conversation.contact_id}</p>
                <p>Owner: {contact?.owner_user_id ? (isContactAssignedToCurrentUser ? "Assigned to you" : contact.owner_user_id) : "Unassigned"}</p>
                <p>Primary phone: {contact?.primary_phone_e164 ?? "--"}</p>
                <p>Normalized phone: {contact?.primary_phone_normalized ?? "--"}</p>
              </div>
            )}
          </div>
          {canAssign ? (
            <div className="rounded-xl border border-border bg-background-tint p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Assignment</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {isAssignedToCurrentUser ? "This conversation is currently assigned to you." : "Assign this conversation to yourself so it appears in assigned-scope inbox views."}
              </p>
              <Button
                className="mt-4 w-full"
                variant={isAssignedToCurrentUser ? "secondary" : "primary"}
                onClick={handleAssignToMe}
                disabled={isAssigning || Boolean(isAssignedToCurrentUser)}
              >
                {isAssignedToCurrentUser ? "Assigned to you" : isAssigning ? "Assigning..." : "Assign to me"}
              </Button>
            </div>
          ) : null}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border bg-background-tint p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Stability Guarantees</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-text-muted">
              <li>One canonical contact per normalized phone within the organization.</li>
              <li>Conversation ordering follows persisted last message metadata.</li>
              <li>Realtime reflects committed database writes only.</li>
            </ul>
          </motion.div>
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-text-muted">
          Select a thread to inspect the canonical contact and conversation metadata.
        </p>
      )}
    </Card>
  );
}
