import { motion } from "framer-motion";
import { useState } from "react";
import type { Conversation } from "../types/api";
import { assignConversation } from "../api/crm";
import { useContact } from "../hooks/useContacts";
import { getStoredUser } from "../lib/auth";
import { Button } from "./Button";
import { Card } from "./Card";
import { Select } from "./Input";
import { useOrganizationUsers } from "../hooks/useAdmin";

function getContactInitials(name: string | null | undefined) {
  return (name ?? "Unknown")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function getConversationSourceLabel(conversation: Conversation) {
  return conversation.whatsapp_account_label ?? conversation.whatsapp_account_id ?? "Unknown connection";
}

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
  const displayName = contact?.display_name ?? conversation?.contact_name ?? null;
  const avatarUrl = contact?.primary_avatar_url ?? conversation?.contact_avatar_url ?? null;

  // Fetch assignable users for org admin
  const organizationId = currentUser?.organizationId ?? conversation?.organization_id;
  const { data: organizationUsers = [], isLoading: organizationUsersLoading } = useOrganizationUsers(organizationId);
  const assignableUsers = organizationUsers.filter((user) => user.status === "active" && user.role !== "super_admin");

  async function handleAssign(userId: string) {
    if (!conversation || !userId) return;
    setIsAssigning(true);
    try {
      await assignConversation({
        conversationId: conversation.id,
        organizationUserId: userId
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
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-primary/10 text-lg font-semibold text-primary">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName ? `${displayName} profile` : "Contact profile"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">{getContactInitials(displayName)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text">{displayName ?? "Unknown"}</p>
              <p className="truncate text-xs text-text-muted">{contact?.primary_phone_normalized ?? conversation.phone_number_normalized ?? "No normalized number yet"}</p>
              <p className="mt-1 truncate text-xs text-text-soft">Source: {getConversationSourceLabel(conversation)}</p>
              {contact?.primary_phone_e164 ? <p className="mt-1 text-xs text-text-soft">{contact.primary_phone_e164}</p> : null}
            </div>
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
              {organizationUsersLoading ? (
                <p className="mt-2 text-xs text-text-muted">Loading users...</p>
              ) : assignableUsers.length > 0 ? (
                <Select
                  value={conversation.assigned_user_id ?? ""}
                  onChange={(e) => handleAssign(e.target.value)}
                  disabled={isAssigning}
                  className="mt-2 w-full !py-1 !text-xs"
                  aria-label="Assign conversation to user"
                >
                  <option value="" disabled>
                    Unassigned
                  </option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email || user.id}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="mt-2 text-xs text-text-muted">No assignable users.</p>
              )}
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
