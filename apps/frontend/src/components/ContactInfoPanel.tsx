import { Phone, UserRound } from "lucide-react";
import { useState } from "react";
import type { ContactDetailResponse, Conversation, MergedContactRedirect } from "../types/api";
import { assignConversation } from "../api/crm";
import { useContact } from "../hooks/useContacts";
import { getStoredUser } from "../lib/auth";
import { useIsMobileViewport } from "../hooks/useMediaQuery";
import { Button } from "./Button";
import { Card } from "./Card";
import { Select } from "./Input";
import { useOrganizationUsers } from "../hooks/useAdmin";

function isMergedContactRedirect(contact: ContactDetailResponse | undefined | null): contact is MergedContactRedirect {
  return Boolean(contact && "is_merged" in contact && contact.is_merged === true);
}

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

function getDialablePhoneNumber(contact: ContactDetailResponse | null, conversation?: Conversation) {
  const candidates = [
    contact && !isMergedContactRedirect(contact) ? contact.primary_phone_e164 : null,
    contact && !isMergedContactRedirect(contact) ? contact.primary_phone_normalized : null,
    conversation?.phone_number_normalized ?? null
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const compact = candidate.replace(/[\s()-]/g, "");
    if (/^\+?\d{7,15}$/.test(compact)) {
      return compact.startsWith("+") ? compact : `+${compact}`;
    }
  }

  return null;
}

export function ContactInfoPanel({
  className,
  conversation,
  onAssigned,
  mobileSheet = false
}: {
  className?: string;
  conversation?: Conversation;
  onAssigned?: () => void;
  mobileSheet?: boolean;
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const isMobile = useIsMobileViewport();
  const currentUser = getStoredUser();
  const { data: contactResponse, isLoading: contactLoading } = useContact(conversation?.contact_id);
  const activeContact = contactResponse && !isMergedContactRedirect(contactResponse) ? contactResponse : null;
  const mergedRedirect = isMergedContactRedirect(contactResponse) ? contactResponse : null;
  const canAssign = Boolean(currentUser?.organizationUserId && currentUser.permissionKeys.includes("conversations.assign"));
  const isContactAssignedToCurrentUser =
    currentUser?.organizationUserId && activeContact?.owner_user_id === currentUser.organizationUserId;
  const displayName = activeContact?.display_name ?? conversation?.contact_name ?? null;
  const avatarUrl = activeContact?.primary_avatar_url ?? conversation?.contact_avatar_url ?? null;
  const normalizedNumber = activeContact?.primary_phone_normalized ?? conversation?.phone_number_normalized ?? null;
  const e164Number = activeContact?.primary_phone_e164 ?? null;
  const dialablePhoneNumber = getDialablePhoneNumber(contactResponse ?? null, conversation);
  const showMobileSheet = mobileSheet && isMobile;

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
    <Card
      className={`${showMobileSheet ? "border-0 bg-transparent p-0 shadow-none" : "bg-white"} ${className ?? ""}`}
      elevated={false}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{showMobileSheet ? "Contact workspace" : "Contact"}</p>
      {conversation ? (
        <div className={`mt-2 ${showMobileSheet ? "space-y-3" : "space-y-2"}`}>
          <div
            className={
              showMobileSheet
                ? "rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_44px_rgba(20,32,51,0.08)]"
                : "workspace-subtle p-4"
            }
          >
            <div className="flex items-center gap-4">
              <div
                className={`shrink-0 overflow-hidden text-lg font-semibold text-primary ${
                  showMobileSheet ? "h-14 w-14 rounded-[1.25rem] border border-primary/15 bg-primary/10" : "h-16 w-16 rounded-2xl border border-border bg-primary/10"
                }`}
              >
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
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold text-text ${showMobileSheet ? "text-lg" : "text-base"}`}>{displayName ?? "Unknown"}</p>
                <p className="truncate text-sm text-text-muted">{normalizedNumber ?? "No normalized number yet"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {getConversationSourceLabel(conversation)}
                  </span>
                  {e164Number ? (
                    <span className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
                      {e164Number}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {showMobileSheet ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {dialablePhoneNumber ? (
                  <a
                    href={`tel:${dialablePhoneNumber}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90"
                    aria-label={`Call ${displayName ?? "contact"}`}
                  >
                    <Phone size={16} />
                    <span>Call</span>
                  </a>
                ) : (
                  <span className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm font-medium text-slate-400">
                    <Phone size={16} />
                    <span>No valid number</span>
                  </span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-text hover:bg-slate-50"
                  onClick={() => {
                    if (!normalizedNumber) {
                      return;
                    }
                    void navigator.clipboard?.writeText(normalizedNumber);
                  }}
                  disabled={!normalizedNumber}
                >
                  <UserRound size={16} />
                  <span className="ml-2">Copy number</span>
                </Button>
              </div>
            ) : (
              <div className="mt-1">
                <p className="truncate text-xs text-text-soft">Source: {getConversationSourceLabel(conversation)}</p>
                {e164Number ? <p className="mt-1 text-xs text-text-soft">{e164Number}</p> : null}
              </div>
            )}
          </div>

          <div className={`${showMobileSheet ? "rounded-[1.25rem] border border-slate-200 bg-slate-50/90 p-3" : "workspace-subtle mt-1 p-3"}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Details</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/70 bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">Canonical ID</p>
                <p className="mt-1 text-xs text-text-muted">{conversation.contact_id}</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">Owner</p>
                <p className="mt-1 text-xs text-text-muted">
                  {activeContact?.owner_user_id ? (isContactAssignedToCurrentUser ? "You" : activeContact.owner_user_id) : "Unassigned"}
                </p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">Phone</p>
                <p className="mt-1 text-xs text-text-muted">{e164Number ?? "--"}</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">Normalized</p>
                <p className="mt-1 text-xs text-text-muted">{normalizedNumber ?? "--"}</p>
              </div>
            </div>
            {contactLoading ? (
              <p className="mt-3 text-sm leading-6 text-text-muted">Loading canonical contact details...</p>
            ) : mergedRedirect ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                <p>This contact was merged into another canonical profile.</p>
                <p>Target ID: {mergedRedirect.redirect_to_contact_id}</p>
              </div>
            ) : null}
          </div>
          {canAssign ? (
            <div className={`${showMobileSheet ? "rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-[0_14px_34px_rgba(20,32,51,0.06)]" : "workspace-subtle mt-1 p-3"}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Assignment</p>
              {organizationUsersLoading ? (
                <p className="mt-2 text-xs text-text-muted">Loading users...</p>
              ) : assignableUsers.length > 0 ? (
                <Select
                  value={conversation.assigned_user_id ?? ""}
                  onChange={(e) => handleAssign(e.target.value)}
                  disabled={isAssigning}
                  className={`mt-2 w-full ${showMobileSheet ? "!rounded-xl !border-slate-200 !bg-slate-50 !px-3 !py-2 !text-sm" : "!py-1 !text-xs"}`}
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
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-text-muted">
          Select a thread to inspect contact details.
        </p>
      )}
    </Card>
  );
}
