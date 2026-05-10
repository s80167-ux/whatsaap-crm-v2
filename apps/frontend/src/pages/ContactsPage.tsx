import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownAZ, Clock3, Search, Wrench, ChevronDown, MessageCircle, Phone, X } from "lucide-react";
import { assignContact, mergeContacts, sendMessage, startContactConversation, updateContact } from "../api/crm";
import { detectContactRepairProposal } from "../api/admin";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ContactRepairQueueOverlay } from "../components/ContactRepairQueueOverlay";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { PopupOverlay } from "../components/PopupOverlay";
import { useOrganizationUsers, useWhatsAppAccounts } from "../hooks/useAdmin";
import { useContact, useContacts } from "../hooks/useContacts";
import { useIsMobileViewport, useMediaQuery } from "../hooks/useMediaQuery";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";
import type { Contact, ContactDetailResponse, MergedContactRedirect } from "../types/api";

type ContactSortMode = "alphabetical" | "latest" | "oldest";

function isMergedContactRedirect(contact: ContactDetailResponse | undefined | null): contact is MergedContactRedirect {
  return Boolean(contact && "is_merged" in contact && contact.is_merged === true);
}

function getContactInitials(name: string | null) {
  return (name ?? "Unknown")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function getContactLabel(contact: Contact) {
  return contact.display_name ?? contact.primary_phone_normalized ?? contact.primary_phone_e164 ?? "";
}

function getContactStatusInfo(contact: Contact, contactsById: Map<string, Contact>) {
  if (contact.status === "merged") {
    const target = contact.merged_into_contact_id ? contactsById.get(contact.merged_into_contact_id) : null;
    return {
      label: target ? `Merged → ${getContactLabel(target) || "target"}` : "Merged",
      type: "merged"
    };
  }

  return {
    label: "Active",
    type: "active"
  };
}

async function updateContactDisplayName(contactId: string, displayName: string | null, organizationId?: string | null) {
  return updateContact({
    contactId,
    organizationId,
    displayName
  });
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getPrimarySourceLabel(contact: Contact) {
  return contact.whatsapp_sources?.[0]?.label ?? null;
}

function getDialablePhoneNumber(contact: Contact | null) {
  const candidates = [contact?.primary_phone_e164 ?? null, contact?.primary_phone_normalized ?? null];

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

function getMessageableSources(contact: Contact | null) {
  return contact?.whatsapp_sources?.filter((source) => source.id) ?? [];
}

function getUserLabel(user: { full_name: string | null; email: string | null; role: string }) {
  const name = user.full_name?.trim() || user.email || "Unnamed user";
  return `${name} (${user.role.replace(/_/g, " ")})`;
}

function CompactRepairTools({
  contact,
  canWrite,
  organizationId,
  onChanged,
  onOpenQueue,
  onOpenManualMerge,
  repairRequested = false
}: {
  contact: Contact;
  canWrite: boolean;
  organizationId?: string | null;
  onChanged: () => Promise<void>;
  onOpenQueue: () => void;
  onOpenManualMerge: () => void;
  repairRequested?: boolean;
}) {
  const isMobile = useIsMobileViewport();
  const [expanded, setExpanded] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState(contact.display_name ?? "");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setManualName(contact.display_name ?? "");
    setMessage(null);
    setExpanded(false);
    setManualOpen(false);
  }, [contact.id, contact.display_name]);

  useEffect(() => {
    if (repairRequested) {
      setExpanded(true);
    }
  }, [contact.id, repairRequested]);

  async function runAction(action: string, handler: () => Promise<string | void>) {
    if (!canWrite) {
      setMessage("You do not have permission to repair contacts.");
      return;
    }
    if (!organizationId) {
      setMessage("Select an organization before running contact repair.");
      return;
    }

    setBusyAction(action);
    setMessage(null);
    try {
      const resultMessage = await handler();
      await onChanged();
      setMessage(resultMessage || "Contact repair updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete repair action.");
    } finally {
      setBusyAction(null);
    }
  }

  const clearCanonicalName = () =>
    runAction("clear-name", async () => {
      await updateContactDisplayName(contact.id, null, organizationId);
    });

  const saveManualName = () =>
    runAction("save-name", async () => {
      const trimmed = manualName.trim();
      await updateContactDisplayName(contact.id, trimmed || null, organizationId);
    });

  const refreshDiagnosis = () =>
    runAction("refresh", async () => {
      const result = await detectContactRepairProposal({
        contactId: contact.id,
        organizationId
      });

      if (result.status === "pending" || result.created || result.proposal) {
        return "Diagnosis refreshed. Open Repair Queue to review the pending proposal.";
      }

      return "Diagnosis refreshed. No repair proposal was found for this contact.";
    });

  const disabled = !canWrite || busyAction !== null;
  const showCollapsedMobile = isMobile && !expanded;

  return (
    <div className="rounded-2xl border border-primary/10 bg-background-tint/70 p-3 shadow-soft">
      {showCollapsedMobile ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wrench size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">Contact repair</p>
              <p className="text-xs text-text-muted">Admin tools</p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setExpanded(true)}
            disabled={!canWrite}
          >
            Open
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wrench size={15} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-soft">Repair tools</p>
                  <p className="text-xs text-text-muted">Compact correction for wrong CRM names.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                className="px-3 py-2 text-xs"
                onClick={onOpenQueue}
                disabled={!canWrite}
              >
                Review queue
              </Button>
              <Button
                variant="secondary"
                className="px-3 py-2 text-xs"
                onClick={onOpenManualMerge}
                disabled={!canWrite}
              >
                Manual merge
              </Button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setExpanded((value) => !value)}
                disabled={!canWrite}
              >
                {expanded ? "Hide" : "Open tools"}
                <ChevronDown size={14} className={`transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={refreshDiagnosis} disabled={disabled}>
              {busyAction === "refresh" ? "Refreshing..." : "Refresh diagnosis"}
            </Button>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={clearCanonicalName} disabled={disabled}>
              {busyAction === "clear-name" ? "Clearing..." : "Clear wrong name"}
            </Button>
          </div>

          {expanded ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="secondary" className="px-2 py-2 text-xs" onClick={refreshDiagnosis} disabled={disabled}>
              Clean suspicious data
            </Button>
            <Button variant="secondary" className="px-2 py-2 text-xs" onClick={clearCanonicalName} disabled={disabled}>
              Clear canonical name
            </Button>
            <Button
              variant="secondary"
              className="px-2 py-2 text-xs"
              onClick={() => setMessage("Avatar clearing needs backend support before it can change database data.")}
              disabled={!canWrite || busyAction !== null}
            >
              Clear avatar
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-white p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft"
              onClick={() => setManualOpen((value) => !value)}
            >
              Manual override
              <ChevronDown size={14} className={`transition ${manualOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {manualOpen ? (
              <div className="mt-3 flex gap-2">
                <Input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Correct name or leave blank"
                  className="h-9 min-w-0 flex-1 text-sm"
                  disabled={disabled}
                />
                <Button className="h-9 px-3 text-xs" onClick={saveManualName} disabled={disabled}>
                  {busyAction === "save-name" ? "Saving..." : "Save"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
          ) : null}
        </>
      )}

      {message ? <p className="mt-2 text-xs text-text-muted">{message}</p> : null}
    </div>
  );
}

export function ContactsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobileViewport();
  const isCompactDetailLayout = useMediaQuery("(max-width: 1023px)");
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const selectedOrganizationId = dashboardContext.selectedOrganizationId;
  const [assigningContactId, setAssigningContactId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactSortMode, setContactSortMode] = useState<ContactSortMode>("latest");
  const [selectedWhatsAppAccountId, setSelectedWhatsAppAccountId] = useState<string>("");
  const [redirectMessage, setRedirectMessage] = useState<string | null>(null);
  const [isRepairQueueOpen, setIsRepairQueueOpen] = useState(false);
  const [isManualMergeOpen, setIsManualMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeNote, setMergeNote] = useState("");
  const [isMergingContact, setIsMergingContact] = useState(false);
  const [mergeMessage, setMergeMessage] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [composeContact, setComposeContact] = useState<Contact | null>(null);
  const [composeAccountId, setComposeAccountId] = useState("");
  const [composeText, setComposeText] = useState("");
  const [isSendingContactMessage, setIsSendingContactMessage] = useState(false);
  const [composeNotice, setComposeNotice] = useState<string | null>(null);
  const activeOrganizationId = isSuperAdmin ? selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const { data: whatsappAccounts = [] } = useWhatsAppAccounts(activeOrganizationId, true);
  const { data: contacts = [], error: contactsError, isError: contactsIsError, isLoading } = useContacts(
    undefined,
    isSuperAdmin ? activeOrganizationId : undefined,
    true
  );
  const { data: selectedContactResponse } = useContact(
    selectedContactId ?? undefined,
    isSuperAdmin ? activeOrganizationId : undefined,
    true
  );
  const activeContact = selectedContactResponse && !isMergedContactRedirect(selectedContactResponse) ? selectedContactResponse : null;
  const canAssignContacts = Boolean(currentUser?.organizationUserId && currentUser.permissionKeys.includes("contacts.write"));
  const canSendMessages = Boolean(activeOrganizationId && currentUser?.permissionKeys.includes("messages.send"));
  const canRepairContacts = isSuperAdmin || canAssignContacts;
  const canAssignContactsToTeam = Boolean(
    canAssignContacts &&
      currentUser?.permissionKeys.includes("org.manage_users") &&
      (!isSuperAdmin || Boolean(activeOrganizationId))
  );
  const { data: organizationUsers = [], isLoading: organizationUsersLoading } = useOrganizationUsers(
    isSuperAdmin ? activeOrganizationId : undefined,
    canAssignContactsToTeam
  );
  const assignableUsers = useMemo(
    () => organizationUsers.filter((user) => user.status === "active" && user.role !== "super_admin"),
    [organizationUsers]
  );
  const assignableUserById = useMemo(
    () => new Map(assignableUsers.map((user) => [user.id, user])),
    [assignableUsers]
  );

  useEffect(() => {
    const linkedContactId = searchParams.get("contactId");
    if (!linkedContactId) {
      return;
    }

    setSelectedContactId(linkedContactId);
    if (searchParams.get("repair") === "1") {
      setRedirectMessage("Opened repair tools for this inbox contact.");
    }
  }, [searchParams]);
  const selectedContactDialableNumber = useMemo(() => getDialablePhoneNumber(activeContact), [activeContact]);
  const composeSources = useMemo(() => getMessageableSources(composeContact), [composeContact]);
  const contactsById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts]
  );
  const mergeTargetOptions = useMemo(
    () =>
      contacts
        .filter((contact) => contact.id !== activeContact?.id && contact.status !== "merged")
        .sort((a, b) => getContactLabel(a).localeCompare(getContactLabel(b))),
    [activeContact?.id, contacts]
  );
  const mergeTargetContact = mergeTargetId ? contactsById.get(mergeTargetId) ?? null : null;

  const visibleContacts = useMemo(() => {
    const ownNumbers = new Set<string>();
    whatsappAccounts.forEach((wa) => {
      if (wa.phone_number) ownNumbers.add(wa.phone_number);
      if (wa.phone_number_normalized) ownNumbers.add(wa.phone_number_normalized);
    });

    const normalizedSearch = contactSearch.trim().toLowerCase();
    let filteredContacts = normalizedSearch
      ? contacts.filter((contact) =>
          [
            contact.display_name,
            contact.primary_phone_e164,
            contact.primary_phone_normalized
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        )
      : contacts;

    filteredContacts = filteredContacts.filter(
      (contact) =>
        contact.primary_phone_e164 && ownNumbers.has(contact.primary_phone_e164)
          ? false
        : contact.primary_phone_normalized && ownNumbers.has(contact.primary_phone_normalized)
          ? false
        : true
    );

    if (selectedWhatsAppAccountId) {
      filteredContacts = filteredContacts.filter((contact) => {
        return contact.whatsapp_sources?.some((source) => source.id === selectedWhatsAppAccountId) ?? false;
      });
    }

    return filteredContacts
      .map((contact, index) => ({ contact, index }))
      .sort((left, right) => {
        if (contactSortMode === "alphabetical") {
          return getContactLabel(left.contact).localeCompare(getContactLabel(right.contact)) || left.index - right.index;
        }

        const newestFirst = left.index - right.index;
        return contactSortMode === "latest" ? newestFirst : -newestFirst;
      })
      .map(({ contact }) => contact);
  }, [contactSearch, contactSortMode, contacts, selectedWhatsAppAccountId, whatsappAccounts]);
  const contactsPagination = usePanelPagination(visibleContacts);
  const sourcePagination = usePanelPagination(activeContact?.whatsapp_sources ?? []);

  useEffect(() => {
    const linkedContactId = searchParams.get("contactId");
    if (linkedContactId) {
      return;
    }

    setSelectedContactId(null);
    setRedirectMessage(null);
  }, [activeOrganizationId, searchParams]);

  useEffect(() => {
    if (!isMergedContactRedirect(selectedContactResponse)) {
      return;
    }

    setRedirectMessage("This contact has been merged. Redirected to the active profile.");
    setSelectedContactId(selectedContactResponse.redirect_to_contact_id);
  }, [selectedContactResponse]);

  useEffect(() => {
    if (!activeContact) {
      setEditDisplayName("");
      setEditPhoneNumber("");
      setEditEmail("");
      setEditCompanyName("");
      setEditNotes("");
      setSaveMessage(null);
      return;
    }

    setEditDisplayName(activeContact.display_name ?? "");
    setEditPhoneNumber(activeContact.primary_phone_e164 ?? activeContact.primary_phone_normalized ?? "");
    setEditEmail(activeContact.email ?? "");
    setEditCompanyName(activeContact.company_name ?? "");
    setEditNotes(activeContact.notes ?? "");
    setSaveMessage(null);
  }, [activeContact]);

  useEffect(() => {
    setIsManualMergeOpen(false);
    setMergeTargetId("");
    setMergeNote("");
    setMergeMessage(null);
  }, [activeContact?.id]);

  async function handleAssignContact(contactId: string, organizationUserId: string) {
    if (!organizationUserId) {
      return;
    }

    setAssigningContactId(contactId);
    try {
      await assignContact({
        contactId,
        organizationUserId
      });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
    } finally {
      setAssigningContactId(null);
    }
  }

  async function refreshSelectedContact() {
    if (!selectedContactId) return;
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    await queryClient.invalidateQueries({ queryKey: ["contact", selectedContactId] });
  }

  async function handleManualMerge() {
    if (!activeContact || !mergeTargetId || isMergingContact) {
      return;
    }

    setIsMergingContact(true);
    setMergeMessage(null);

    try {
      await mergeContacts({
        sourceContactId: activeContact.id,
        targetContactId: mergeTargetId,
        note: emptyToNull(mergeNote)
      });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["contact", activeContact.id] });
      await queryClient.invalidateQueries({ queryKey: ["contact", mergeTargetId] });
      setSelectedContactId(mergeTargetId);
      setRedirectMessage("Contacts merged. Showing the active profile.");
      setIsManualMergeOpen(false);
      setMergeTargetId("");
      setMergeNote("");
    } catch (error) {
      setMergeMessage(error instanceof Error ? error.message : "Unable to merge contacts.");
    } finally {
      setIsMergingContact(false);
    }
  }

  function openCompose(contact: Contact) {
    const sources = getMessageableSources(contact);

    setComposeContact(contact);
    setComposeAccountId(sources[0]?.id ?? "");
    setComposeText("");
    setComposeNotice(null);
  }

  function closeCompose() {
    if (isSendingContactMessage) {
      return;
    }

    setComposeContact(null);
    setComposeAccountId("");
    setComposeText("");
    setComposeNotice(null);
  }

  async function handleSendContactMessage() {
    if (!composeContact || !composeAccountId || !activeOrganizationId) {
      setComposeNotice("Choose a contact and WhatsApp source before sending.");
      return;
    }

    if (!composeText.trim()) {
      setComposeNotice("Write a message before sending.");
      return;
    }

    setIsSendingContactMessage(true);
    setComposeNotice(null);

    try {
      const conversation = await startContactConversation({
        contactId: composeContact.id,
        whatsappAccountId: composeAccountId
      });

      await sendMessage({
        whatsappAccountId: composeAccountId,
        conversationId: conversation.id,
        organizationId: activeOrganizationId,
        text: composeText
      });

      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setRedirectMessage("WhatsApp message queued.");
      setComposeContact(null);
      setComposeAccountId("");
      setComposeText("");
    } catch (error) {
      setComposeNotice(error instanceof Error ? error.message : "Unable to send WhatsApp message.");
    } finally {
      setIsSendingContactMessage(false);
    }
  }

  async function handleSaveContactProfile() {
    if (!activeContact || !canRepairContacts) {
      return;
    }

    setIsSavingContact(true);
    setSaveMessage(null);

    try {
      await updateContact({
        contactId: activeContact.id,
        organizationId: activeOrganizationId,
        displayName: emptyToNull(editDisplayName),
        phoneNumber: emptyToNull(editPhoneNumber),
        email: emptyToNull(editEmail),
        companyName: emptyToNull(editCompanyName),
        notes: emptyToNull(editNotes)
      });
      await refreshSelectedContact();
      setSaveMessage("Contact profile saved.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save contact profile.");
    } finally {
      setIsSavingContact(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1.15fr)_400px]">
      <Card elevated className="workspace-block min-w-0">
        <div className={isMobile ? "space-y-3" : "workspace-page-header"}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Contacts</p>
            <h2 className={isMobile ? "mt-2 text-[1.7rem] font-semibold tracking-tight text-text" : "mt-3 section-title"}>
              Canonical customer records
            </h2>
            <p className={isMobile ? "mt-2 max-w-xl text-sm leading-6 text-text-muted" : "mt-2 max-w-2xl section-copy"}>
              Every customer is stored once per organization and can fan out into many WhatsApp identities without duplicating the core record.
            </p>
          </div>
          <div className={isMobile ? "rounded-2xl border border-border bg-background-tint px-4 py-3" : "workspace-subtle max-w-xs"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Workspace focus</p>
            <p className={isMobile ? "mt-1 text-sm leading-6 text-text-muted" : "mt-2 text-sm leading-6 text-text-muted"}>
              Keep ownership, source history, and identity cleanup easy to scan from one desktop view.
            </p>
          </div>
        </div>

        {redirectMessage ? (
          <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
            {redirectMessage}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 w-full sm:min-w-[300px] sm:w-auto">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Search contact</p>
              <div className="flex h-10 items-stretch border border-border bg-background-tint">
                <div className="flex items-center px-3 text-text-soft">
                  <Search size={15} aria-hidden="true" />
                </div>
                <Input
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder="Name or phone"
                  className="h-full border-0 bg-transparent px-0 py-0 text-sm focus:ring-0"
                />
              </div>
            </div>

            <div className="min-w-0 w-full sm:min-w-[200px] sm:w-auto flex flex-col">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">WhatsApp Source</p>
              <Select
                value={selectedWhatsAppAccountId}
                onChange={(e) => setSelectedWhatsAppAccountId(e.target.value)}
                className="h-10 w-full"
              >
                <option value="">All accounts</option>
                {whatsappAccounts && whatsappAccounts.map((wa) => (
                  <option key={wa.id} value={wa.id}>
                    {wa.name || wa.display_name || wa.phone_number || wa.id}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Sort</p>
              <div className="grid h-10 grid-cols-2 overflow-hidden rounded-xl border border-border bg-white/70 shadow-soft">
                <button
                  type="button"
                  className={`flex items-center justify-center gap-2 px-3 text-xs font-semibold transition hover:bg-background-tint ${
                    contactSortMode === "alphabetical" ? "bg-primary/10 text-primary" : "text-text-soft"
                  }`}
                  title="Sort alphabetically"
                  aria-label="Sort contacts alphabetically"
                  aria-pressed={contactSortMode === "alphabetical"}
                  onClick={() => setContactSortMode("alphabetical")}
                >
                  <ArrowDownAZ size={16} aria-hidden="true" />
                  A-Z
                </button>
                <button
                  type="button"
                  className={`flex items-center justify-center gap-1 border-l border-border px-3 text-xs font-semibold transition hover:bg-background-tint ${
                    contactSortMode === "latest" || contactSortMode === "oldest" ? "bg-primary/10 text-primary" : "text-text-soft"
                  }`}
                  title={contactSortMode === "oldest" ? "Showing oldest first" : "Showing latest first"}
                  aria-label={contactSortMode === "oldest" ? "Sort contacts by latest first" : "Sort contacts by oldest first"}
                  aria-pressed={contactSortMode === "latest" || contactSortMode === "oldest"}
                  onClick={() => setContactSortMode((mode) => (mode === "oldest" ? "latest" : "oldest"))}
                >
                  <Clock3 size={16} aria-hidden="true" />
                  {contactSortMode === "oldest" ? "Old" : "New"}
                </button>
              </div>
            </div>
          </div>

          <p className="text-sm text-text-muted">{visibleContacts.length} of {contacts.length} contacts</p>
        </div>

        {isMobile ? (
          <div className="mt-6 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-border bg-background-tint px-4 py-8 text-sm text-text-muted">
                Loading contacts...
              </div>
            ) : contactsIsError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-sm text-red-600">
                {contactsError instanceof Error ? contactsError.message : "Unable to load contacts."}
              </div>
            ) : visibleContacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background-tint px-4 py-8 text-sm text-text-muted">
                {contactSearch.trim() ? "No contacts match your search." : "No contacts found."}
              </div>
            ) : (
              contactsPagination.visibleItems.map((contact) => {
                const status = getContactStatusInfo(contact, contactsById);
                const sourceLabel = getPrimarySourceLabel(contact);

                return (
                  <motion.div
                    key={contact.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    role="button"
                    tabIndex={0}
                    className={`w-full rounded-2xl border p-4 text-left shadow-soft transition ${
                      selectedContactId === contact.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-white"
                    }`}
                    onClick={() => {
                      setRedirectMessage(null);
                      setSelectedContactId(contact.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setRedirectMessage(null);
                        setSelectedContactId(contact.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-primary/10 text-xs font-semibold text-primary">
                        {contact.primary_avatar_url ? (
                          <img
                            src={contact.primary_avatar_url}
                            alt={contact.display_name ? `${contact.display_name} profile` : "Contact profile"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center">{getContactInitials(contact.display_name)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold text-text">
                          {contact.display_name ?? contact.primary_phone_normalized ?? "Unknown"}
                        </p>
                        <p className="mt-1 break-all text-sm text-text-muted">
                          {contact.primary_phone_normalized ?? "--"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {sourceLabel ? (
                        <span className="inline-flex max-w-full items-center rounded-full border border-border bg-background-tint px-2.5 py-1 text-[11px] font-medium text-text-muted">
                          <span className="truncate">{sourceLabel}</span>
                          {(contact.whatsapp_source_count ?? 0) > 1 ? (
                            <span className="ml-1 text-text-soft">+{(contact.whatsapp_source_count ?? 1) - 1}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-border bg-background-tint px-2.5 py-1 text-[11px] font-medium text-text-soft">
                          No source
                        </span>
                      )}
                      <span
                        className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          status.type === "merged"
                            ? "border-slate-200 bg-slate-100 text-slate-600"
                            : "border-emerald-100 bg-emerald-50 text-emerald-700"
                        }`}
                        title={status.label}
                      >
                        <span className="truncate">{status.label}</span>
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      {getDialablePhoneNumber(contact) ? (
                        <a
                          href={`tel:${getDialablePhoneNumber(contact)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-text-muted transition hover:bg-background-tint hover:text-primary"
                          title={`Call ${contact.display_name ?? "contact"}`}
                          aria-label={`Call ${contact.display_name ?? "contact"}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Phone size={15} aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background-tint text-text-soft opacity-60">
                          <Phone size={15} aria-hidden="true" />
                        </span>
                      )}
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-text-muted transition hover:bg-background-tint hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        title={`Send WhatsApp to ${contact.display_name ?? "contact"}`}
                        aria-label={`Send WhatsApp to ${contact.display_name ?? "contact"}`}
                        disabled={!canSendMessages || getMessageableSources(contact).length === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          openCompose(contact);
                        }}
                      >
                        <MessageCircle size={15} aria-hidden="true" />
                      </button>
                    </div>

                    {canAssignContacts ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-soft">Owner</p>
                        {canAssignContactsToTeam ? (
                          <Select
                            value={contact.owner_user_id ?? ""}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              void handleAssignContact(contact.id, event.target.value);
                            }}
                            disabled={assigningContactId === contact.id || organizationUsersLoading || assignableUsers.length === 0}
                            className="h-10 w-full min-w-0 bg-white px-3 py-2 text-sm"
                            aria-label={`Assign ${contact.display_name ?? "contact"} to a team member`}
                          >
                            <option value="" disabled>
                              Unassigned
                            </option>
                            {assignableUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {getUserLabel(user)}
                              </option>
                            ))}
                          </Select>
                        ) : contact.owner_user_id === currentUser?.organizationUserId ? (
                          <p className="text-sm text-text-soft">Assigned to you</p>
                        ) : (
                          <Button
                            variant="secondary"
                            className="w-full px-3 py-2 text-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleAssignContact(contact.id, currentUser?.organizationUserId ?? "");
                            }}
                            disabled={assigningContactId === contact.id}
                          >
                            {assigningContactId === contact.id ? "Assigning..." : "Assign to me"}
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </motion.div>
                );
              })
            )}
          </div>
        ) : (
          <div className="workspace-table-wrap mt-6">
            <table className="workspace-table workspace-table-compact w-full table-fixed">
              <thead>
                <tr>
                  <th className="w-[26%] px-2.5 py-2">Name</th>
                  <th className="w-[21%] px-2.5 py-2">Normalized</th>
                  <th className="w-[17%] px-2.5 py-2">Source</th>
                  <th className="w-[12%] px-2.5 py-2">Status</th>
                  <th className="w-[10%] px-2.5 py-2">Actions</th>
                  {canAssignContacts ? <th className="w-[14%] px-2.5 py-2">Owner</th> : null}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="text-sm text-text-muted" colSpan={canAssignContacts ? 6 : 5}>
                      Loading contacts...
                    </td>
                  </tr>
                ) : contactsIsError ? (
                  <tr>
                    <td className="text-sm text-red-600" colSpan={canAssignContacts ? 6 : 5}>
                      {contactsError instanceof Error ? contactsError.message : "Unable to load contacts."}
                    </td>
                  </tr>
                ) : visibleContacts.length === 0 ? (
                  <tr>
                    <td className="text-sm text-text-muted" colSpan={canAssignContacts ? 6 : 5}>
                      {contactSearch.trim() ? "No contacts match your search." : "No contacts found."}
                    </td>
                  </tr>
                ) : (
                  contactsPagination.visibleItems.map((contact) => (
                    <motion.tr
                      key={contact.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className={`table-row cursor-pointer text-xs text-text-muted ${
                        selectedContactId === contact.id ? "bg-primary/5" : ""
                      }`}
                      onClick={() => {
                        setRedirectMessage(null);
                        setSelectedContactId(contact.id);
                      }}
                    >
                      <td className="px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border bg-primary/10 text-[10px] font-semibold text-primary">
                            {contact.primary_avatar_url ? (
                              <img
                                src={contact.primary_avatar_url}
                                alt={contact.display_name ? `${contact.display_name} profile` : "Contact profile"}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center">{getContactInitials(contact.display_name)}</span>
                            )}
                          </div>
                          <span className="min-w-0 truncate font-medium text-text">{contact.display_name ?? contact.primary_phone_normalized ?? "Unknown"}</span>
                        </div>
                      </td>
                      <td className="truncate px-2.5 py-1.5" title={contact.primary_phone_normalized ?? undefined}>
                        {contact.primary_phone_normalized ?? "--"}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {getPrimarySourceLabel(contact) ? (
                          <span className="inline-flex max-w-[150px] items-center rounded-full border border-border bg-background-tint px-2 py-0.5 text-[11px] font-medium text-text-muted">
                            <span className="truncate">{getPrimarySourceLabel(contact)}</span>
                            {(contact.whatsapp_source_count ?? 0) > 1 ? (
                              <span className="ml-1 text-text-soft">+{(contact.whatsapp_source_count ?? 1) - 1}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-text-soft">--</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {(() => {
                          const status = getContactStatusInfo(contact, contactsById);

                          return (
                            <span
                              className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                status.type === "merged"
                                  ? "border-slate-200 bg-slate-100 text-slate-600"
                                  : "border-emerald-100 bg-emerald-50 text-emerald-700"
                              }`}
                              title={status.label}
                            >
                              <span className="truncate">{status.label}</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {getDialablePhoneNumber(contact) ? (
                            <a
                              href={`tel:${getDialablePhoneNumber(contact)}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-text-muted transition hover:bg-background-tint hover:text-primary"
                              title={`Call ${contact.display_name ?? "contact"}`}
                              aria-label={`Call ${contact.display_name ?? "contact"}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Phone size={14} aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-tint text-text-soft opacity-60">
                              <Phone size={14} aria-hidden="true" />
                            </span>
                          )}
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-text-muted transition hover:bg-background-tint hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            title={`Send WhatsApp to ${contact.display_name ?? "contact"}`}
                            aria-label={`Send WhatsApp to ${contact.display_name ?? "contact"}`}
                            disabled={!canSendMessages || getMessageableSources(contact).length === 0}
                            onClick={(event) => {
                              event.stopPropagation();
                              openCompose(contact);
                            }}
                          >
                            <MessageCircle size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                      {canAssignContacts ? (
                        <td className="px-2.5 py-1.5">
                          {canAssignContactsToTeam ? (
                            <Select
                              value={contact.owner_user_id ?? ""}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                event.stopPropagation();
                                void handleAssignContact(contact.id, event.target.value);
                              }}
                              disabled={assigningContactId === contact.id || organizationUsersLoading || assignableUsers.length === 0}
                              className="h-8 w-full min-w-0 bg-white px-2 py-1 text-[11px]"
                              aria-label={`Assign ${contact.display_name ?? "contact"} to a team member`}
                            >
                              <option value="" disabled>
                                Unassigned
                              </option>
                              {assignableUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {getUserLabel(user)}
                                </option>
                              ))}
                            </Select>
                          ) : contact.owner_user_id === currentUser?.organizationUserId ? (
                            <span className="whitespace-nowrap text-text-soft">Assigned to you</span>
                          ) : (
                            <Button
                              variant="secondary"
                              className="whitespace-nowrap px-2 py-1 text-[11px]"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleAssignContact(contact.id, currentUser?.organizationUserId ?? "");
                              }}
                              disabled={assigningContactId === contact.id}
                            >
                              {assigningContactId === contact.id ? "Assigning..." : "Assign to me"}
                            </Button>
                          )}
                        </td>
                      ) : null}
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <PanelPagination
          className="mt-4"
          page={contactsPagination.page}
          pageCount={contactsPagination.pageCount}
          totalItems={contactsPagination.totalItems}
          onPageChange={contactsPagination.setPage}
        />
      </Card>

      {(!isCompactDetailLayout || selectedContactId || selectedContactResponse) ? (
        <div
          className={
            isCompactDetailLayout
              ? "fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-3 py-6"
              : ""
          }
          onClick={() => {
            if (isCompactDetailLayout) {
              setSelectedContactId(null);
              setRedirectMessage(null);
            }
          }}
        >
          <Card
            elevated
            className={
              isCompactDetailLayout
                ? "workspace-block max-h-[86vh] w-full max-w-2xl overflow-y-auto border-primary/10 bg-white shadow-panel"
                : "workspace-block border-primary/10 bg-white shadow-panel lg:sticky lg:top-6 lg:self-start"
            }
            onClick={(event) => event.stopPropagation()}
          >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-soft">Detail</p>
            <p className="mt-2 text-sm text-text-muted">Review profile health, ownership, and source records.</p>
          </div>
          {isCompactDetailLayout ? (
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-text-muted transition hover:bg-background-tint"
              onClick={() => {
                setSelectedContactId(null);
                setRedirectMessage(null);
              }}
              aria-label="Close contact details"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {activeContact ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-2xl border border-border bg-primary/10 text-lg font-semibold text-primary">
                {activeContact.primary_avatar_url ? (
                  <img
                    src={activeContact.primary_avatar_url}
                    alt={activeContact.display_name ? `${activeContact.display_name} profile` : "Contact profile"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">{getContactInitials(activeContact.display_name)}</span>
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-text">{activeContact.display_name ?? activeContact.primary_phone_normalized ?? "Unknown"}</p>
                <p className="text-sm text-text-muted">{activeContact.primary_phone_normalized ?? "No normalized number yet"}</p>
                {activeContact.primary_phone_e164 ? <p className="mt-1 text-xs text-text-soft">{activeContact.primary_phone_e164}</p> : null}
                {(() => {
                  const status = getContactStatusInfo(activeContact, contactsById);

                  return (
                    <span
                      className={`mt-2 inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        status.type === "merged"
                          ? "border-slate-200 bg-slate-100 text-slate-600"
                          : "border-emerald-100 bg-emerald-50 text-emerald-700"
                      }`}
                      title={status.label}
                    >
                      {status.label}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedContactDialableNumber ? (
                <a
                  href={`tel:${selectedContactDialableNumber}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90"
                  aria-label={`Call ${activeContact.display_name ?? "contact"}`}
                >
                  <Phone size={16} aria-hidden="true" />
                  <span>Call</span>
                </a>
              ) : null}
              <Button
                variant="secondary"
                className="h-11 px-4 text-sm"
                onClick={() => openCompose(activeContact)}
                disabled={!canSendMessages || getMessageableSources(activeContact).length === 0}
              >
                <MessageCircle size={16} aria-hidden="true" />
                Send WhatsApp
              </Button>
            </div>
            <CompactRepairTools
              contact={activeContact}
              canWrite={canRepairContacts}
              organizationId={activeOrganizationId}
              onChanged={refreshSelectedContact}
              onOpenQueue={() => setIsRepairQueueOpen(true)}
              onOpenManualMerge={() => {
                setMergeMessage(null);
                setIsManualMergeOpen(true);
              }}
              repairRequested={searchParams.get("repair") === "1"}
            />
            <div className="workspace-subtle text-sm leading-6 text-text-muted">
              <p>Contact ID: {activeContact.id}</p>
              <p>
                Owner:{" "}
                {activeContact.owner_user_id
                  ? activeContact.owner_user_id === currentUser?.organizationUserId
                    ? "Assigned to you"
                    : assignableUserById.get(activeContact.owner_user_id)
                      ? getUserLabel(assignableUserById.get(activeContact.owner_user_id)!)
                      : activeContact.owner_user_id
                  : "Unassigned"}
              </p>
            </div>
            <div className="workspace-subtle">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Profile details</p>
                  <p className="mt-1 text-sm text-text-muted">Update the CRM record and save directly to the contacts table.</p>
                </div>
                <Button
                  className="px-4 py-2 text-sm"
                  onClick={() => void handleSaveContactProfile()}
                  disabled={!canRepairContacts || isSavingContact}
                >
                  {isSavingContact ? "Saving..." : "Save profile"}
                </Button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Display name</span>
                  <Input
                    value={editDisplayName}
                    onChange={(event) => setEditDisplayName(event.target.value)}
                    placeholder="Contact name"
                    className="mt-1 h-10 w-full"
                    disabled={!canRepairContacts || isSavingContact}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Phone number</span>
                  <Input
                    value={editPhoneNumber}
                    onChange={(event) => setEditPhoneNumber(event.target.value)}
                    placeholder="+60123456789"
                    className="mt-1 h-10 w-full"
                    disabled={!canRepairContacts || isSavingContact}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Email</span>
                  <Input
                    value={editEmail}
                    onChange={(event) => setEditEmail(event.target.value)}
                    placeholder="contact@company.com"
                    type="email"
                    className="mt-1 h-10 w-full"
                    disabled={!canRepairContacts || isSavingContact}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Company name</span>
                  <Input
                    value={editCompanyName}
                    onChange={(event) => setEditCompanyName(event.target.value)}
                    placeholder="Company name"
                    className="mt-1 h-10 w-full"
                    disabled={!canRepairContacts || isSavingContact}
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Notes</span>
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  rows={4}
                  placeholder="Add internal notes for this contact"
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canRepairContacts || isSavingContact}
                />
              </label>
              {saveMessage ? <p className="mt-3 text-sm text-text-muted">{saveMessage}</p> : null}
            </div>
            <div className="workspace-subtle">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">WhatsApp source</p>
              {activeContact.whatsapp_sources?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sourcePagination.visibleItems.map((source) => (
                    <span
                      key={source.id}
                      className="inline-flex max-w-full items-center rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-text-muted"
                      title={source.id}
                    >
                      <span className="truncate">{source.label ?? source.id}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-muted">No WhatsApp source recorded yet.</p>
              )}
              <PanelPagination
                className="mt-3"
                page={sourcePagination.page}
                pageCount={sourcePagination.pageCount}
                totalItems={sourcePagination.totalItems}
                onPageChange={sourcePagination.setPage}
              />
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-text-muted">
            {selectedContactId && !selectedContactResponse
              ? "Loading contact details..."
              : isMergedContactRedirect(selectedContactResponse)
              ? "Redirecting to the active contact profile..."
              : "Select a contact to inspect the canonical record and ownership details."}
          </p>
        )}
          </Card>
        </div>
      ) : null}
      {composeContact ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Send WhatsApp</p>
                <p className="mt-2 truncate text-lg font-semibold text-text">
                  {composeContact.display_name ?? composeContact.primary_phone_normalized ?? "Unknown"}
                </p>
                <p className="mt-1 break-all text-sm text-text-muted">
                  {composeContact.primary_phone_normalized ?? composeContact.primary_phone_e164 ?? "No phone number"}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-text-muted transition hover:bg-background-tint"
                onClick={closeCompose}
                aria-label="Close WhatsApp composer"
                disabled={isSendingContactMessage}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <label className="mt-5 block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">WhatsApp source</span>
              <Select
                value={composeAccountId}
                onChange={(event) => setComposeAccountId(event.target.value)}
                className="mt-1 h-10 w-full"
                disabled={isSendingContactMessage || composeSources.length <= 1}
              >
                {composeSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label ?? source.id}
                  </option>
                ))}
              </Select>
            </label>

            <label className="mt-4 block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Message</span>
              <textarea
                value={composeText}
                onChange={(event) => setComposeText(event.target.value)}
                rows={5}
                placeholder="Type your WhatsApp message..."
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSendingContactMessage}
              />
            </label>

            {composeNotice ? <p className="mt-3 text-sm text-red-600">{composeNotice}</p> : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={closeCompose} disabled={isSendingContactMessage}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleSendContactMessage()}
                disabled={isSendingContactMessage || !composeAccountId || !composeText.trim()}
              >
                <MessageCircle size={16} aria-hidden="true" />
                {isSendingContactMessage ? "Sending..." : "Send message"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <PopupOverlay
        open={isManualMergeOpen}
        onClose={() => {
          if (!isMergingContact) {
            setIsManualMergeOpen(false);
          }
        }}
        title="Manual merge"
        description="Merge the selected contact into an existing canonical profile."
        panelClassName="max-w-[min(38rem,calc(100vw-2rem))]"
      >
        {activeContact ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-background-tint/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Merge away</p>
                <p className="mt-2 text-sm font-semibold text-text">{getContactLabel(activeContact) || "Unknown"}</p>
                <p className="mt-1 text-xs text-text-muted">{activeContact.primary_phone_normalized ?? "No phone"}</p>
              </div>
              <div className="rounded-xl border border-border bg-background-tint/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Keep as canonical</p>
                <p className="mt-2 text-sm font-semibold text-text">
                  {mergeTargetContact ? getContactLabel(mergeTargetContact) || "Unknown" : "Choose target"}
                </p>
                <p className="mt-1 text-xs text-text-muted">{mergeTargetContact?.primary_phone_normalized ?? "No target selected"}</p>
              </div>
            </div>

            {mergeMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{mergeMessage}</div>
            ) : null}

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Target contact</span>
              <Select
                className="mt-1 h-11 w-full"
                value={mergeTargetId}
                onChange={(event) => setMergeTargetId(event.target.value)}
                disabled={isMergingContact}
              >
                <option value="">Select contact to keep</option>
                {mergeTargetOptions.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {(getContactLabel(contact) || "Unknown") +
                      (contact.primary_phone_normalized ? ` - ${contact.primary_phone_normalized}` : "")}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Note</span>
              <Input
                className="mt-1 h-11 w-full"
                value={mergeNote}
                onChange={(event) => setMergeNote(event.target.value)}
                placeholder="Optional reason"
                disabled={isMergingContact}
              />
            </label>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
              Conversations, messages, WhatsApp identities, leads, activities, sales orders, dispatch records, and quick reply outcomes will move to the target contact. The selected contact will be marked as merged.
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                className="px-4 py-2 text-sm"
                onClick={() => setIsManualMergeOpen(false)}
                disabled={isMergingContact}
              >
                Cancel
              </Button>
              <Button
                className="px-4 py-2 text-sm"
                onClick={() => void handleManualMerge()}
                disabled={!mergeTargetId || isMergingContact}
              >
                {isMergingContact ? "Merging..." : "Merge contact"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Select a contact before merging.</p>
        )}
      </PopupOverlay>
      <ContactRepairQueueOverlay
        open={isRepairQueueOpen}
        onClose={() => setIsRepairQueueOpen(false)}
        organizationId={activeOrganizationId}
        preferredContactId={activeContact?.id ?? selectedContactId}
        onChanged={refreshSelectedContact}
      />
    </div>
  );
}
