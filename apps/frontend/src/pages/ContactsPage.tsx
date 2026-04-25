import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownAZ, Clock3, Search, Wrench, ChevronDown } from "lucide-react";
import { assignContact } from "../api/crm";
import { apiPatch } from "../lib/http";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { useOrganizationUsers, useWhatsAppAccounts } from "../hooks/useAdmin";
import { useContact, useContacts } from "../hooks/useContacts";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";
import type { Contact } from "../types/api";

type ContactSortMode = "alphabetical" | "latest" | "oldest";

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

async function updateContactDisplayName(contactId: string, displayName: string | null) {
  return apiPatch<{ data: Contact }>(`/contacts/${contactId}`, {
    displayName
  });
}

function getPrimarySourceLabel(contact: Contact) {
  return contact.whatsapp_sources?.[0]?.label ?? null;
}

function getUserLabel(user: { full_name: string | null; email: string | null; role: string }) {
  const name = user.full_name?.trim() || user.email || "Unnamed user";
  return `${name} (${user.role.replace(/_/g, " ")})`;
}

function CompactRepairTools({
  contact,
  canWrite,
  onChanged
}: {
  contact: Contact;
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
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

  async function runAction(action: string, handler: () => Promise<void>) {
    if (!canWrite) {
      setMessage("You do not have permission to repair contacts.");
      return;
    }

    setBusyAction(action);
    setMessage(null);
    try {
      await handler();
      await onChanged();
      setMessage("Contact repair updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete repair action.");
    } finally {
      setBusyAction(null);
    }
  }

  const clearCanonicalName = () =>
    runAction("clear-name", async () => {
      await updateContactDisplayName(contact.id, null);
    });

  const saveManualName = () =>
    runAction("save-name", async () => {
      const trimmed = manualName.trim();
      await updateContactDisplayName(contact.id, trimmed || null);
    });

  const refreshDiagnosis = () =>
    runAction("refresh", async () => {
      await Promise.resolve();
    });

  const disabled = !canWrite || busyAction !== null;

  return (
    <div className="rounded-2xl border border-primary/10 bg-background-tint/70 p-3 shadow-soft">
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

      {message ? <p className="mt-2 text-xs text-text-muted">{message}</p> : null}
    </div>
  );
}

export function ContactsPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const selectedOrganizationId = dashboardContext.selectedOrganizationId;
  const [assigningContactId, setAssigningContactId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactSortMode, setContactSortMode] = useState<ContactSortMode>("latest");
  const [selectedWhatsAppAccountId, setSelectedWhatsAppAccountId] = useState<string>("");
  const activeOrganizationId = isSuperAdmin ? selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const { data: whatsappAccounts = [] } = useWhatsAppAccounts(activeOrganizationId, true);
  const { data: contacts = [], error: contactsError, isError: contactsIsError, isLoading } = useContacts(
    undefined,
    isSuperAdmin ? activeOrganizationId : undefined,
    true
  );
  const { data: selectedContact } = useContact(
    selectedContactId ?? undefined,
    isSuperAdmin ? activeOrganizationId : undefined,
    true
  );
  const canAssignContacts = Boolean(currentUser?.organizationUserId && currentUser.permissionKeys.includes("contacts.write"));
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
        return (
          whatsappAccounts.find(
            (wa) =>
              wa.id === selectedWhatsAppAccountId &&
              (wa.phone_number === contact.primary_phone_e164 || wa.phone_number_normalized === contact.primary_phone_normalized)
          )
        );
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
  const sourcePagination = usePanelPagination(selectedContact?.whatsapp_sources ?? []);

  useEffect(() => {
    setSelectedContactId(null);
  }, [activeOrganizationId]);

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

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1.15fr)_400px]">
      <Card elevated className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Contacts</p>
        <h2 className="mt-3 section-title">Canonical customer records</h2>
        <p className="mt-2 max-w-2xl section-copy">
          Every customer is stored once per organization and can fan out into many WhatsApp identities without duplicating the core record.
        </p>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] sm:min-w-[300px]">
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

            <div className="min-w-[200px] flex flex-col">
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
              <div className="grid h-10 grid-cols-2 overflow-hidden border border-border bg-white/70">
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

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white/80">
          <table className="w-full table-fixed bg-white/80">
            <thead className="bg-background-tint text-left text-[10px] uppercase tracking-[0.18em] text-text-soft">
              <tr>
                <th className="w-[34%] px-2.5 py-2">Name</th>
                <th className="w-[26%] px-2.5 py-2">Normalized</th>
                <th className="w-[22%] px-2.5 py-2">Source</th>
                {canAssignContacts ? <th className="w-[18%] px-2.5 py-2">Owner</th> : null}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={canAssignContacts ? 4 : 3}>
                    Loading contacts...
                  </td>
                </tr>
              ) : contactsIsError ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-red-600" colSpan={canAssignContacts ? 4 : 3}>
                    {contactsError instanceof Error ? contactsError.message : "Unable to load contacts."}
                  </td>
                </tr>
              ) : visibleContacts.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={canAssignContacts ? 4 : 3}>
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
                    onClick={() => setSelectedContactId(contact.id)}
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
        <PanelPagination
          className="mt-4"
          page={contactsPagination.page}
          pageCount={contactsPagination.pageCount}
          totalItems={contactsPagination.totalItems}
          onPageChange={contactsPagination.setPage}
        />
      </Card>

      <Card elevated className="border-primary/10 bg-white shadow-panel xl:sticky xl:top-6 xl:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Detail</p>
        {selectedContact ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-2xl border border-border bg-primary/10 text-lg font-semibold text-primary">
                {selectedContact.primary_avatar_url ? (
                  <img
                    src={selectedContact.primary_avatar_url}
                    alt={selectedContact.display_name ? `${selectedContact.display_name} profile` : "Contact profile"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">{getContactInitials(selectedContact.display_name)}</span>
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-text">{selectedContact.display_name ?? selectedContact.primary_phone_normalized ?? "Unknown"}</p>
                <p className="text-sm text-text-muted">{selectedContact.primary_phone_normalized ?? "No normalized number yet"}</p>
                {selectedContact.primary_phone_e164 ? <p className="mt-1 text-xs text-text-soft">{selectedContact.primary_phone_e164}</p> : null}
              </div>
            </div>
            <CompactRepairTools contact={selectedContact} canWrite={canAssignContacts} onChanged={refreshSelectedContact} />
            <div className="rounded-xl border border-border bg-white p-4 text-sm leading-6 text-text-muted shadow-soft">
              <p>Contact ID: {selectedContact.id}</p>
              <p>
                Owner:{" "}
                {selectedContact.owner_user_id
                  ? selectedContact.owner_user_id === currentUser?.organizationUserId
                    ? "Assigned to you"
                    : assignableUserById.get(selectedContact.owner_user_id)
                      ? getUserLabel(assignableUserById.get(selectedContact.owner_user_id)!)
                      : selectedContact.owner_user_id
                  : "Unassigned"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">WhatsApp source</p>
              {selectedContact.whatsapp_sources?.length ? (
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
            Select a contact to inspect the canonical record and ownership details.
          </p>
        )}
      </Card>
    </div>
  );
}
