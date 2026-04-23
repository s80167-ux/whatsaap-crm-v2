import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownAZ, Clock3, Search } from "lucide-react";
import { assignContact } from "../api/crm";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { useOrganizations } from "../hooks/useAdmin";
import { useContact, useContacts } from "../hooks/useContacts";
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

export function ContactsPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const [assigningContactId, setAssigningContactId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactSortMode, setContactSortMode] = useState<ContactSortMode>("latest");
  const { data: organizations = [] } = useOrganizations();
  const activeOrganizationId = isSuperAdmin ? selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const canLoadContacts = !isSuperAdmin || Boolean(activeOrganizationId);
  const { data: contacts = [], error: contactsError, isError: contactsIsError, isLoading } = useContacts(
    undefined,
    isSuperAdmin ? activeOrganizationId : undefined,
    canLoadContacts
  );
  const { data: selectedContact } = useContact(
    selectedContactId ?? undefined,
    isSuperAdmin ? activeOrganizationId : undefined,
    canLoadContacts
  );
  const canAssignContacts = Boolean(currentUser?.organizationUserId && currentUser.permissionKeys.includes("contacts.write"));

  const visibleContacts = useMemo(() => {
    const normalizedSearch = contactSearch.trim().toLowerCase();
    const filteredContacts = normalizedSearch
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
  }, [contactSearch, contactSortMode, contacts]);

  useEffect(() => {
    if (!isSuperAdmin || selectedOrganizationId || organizations.length === 0) {
      return;
    }

    setSelectedOrganizationId(organizations[0].id);
  }, [isSuperAdmin, organizations, selectedOrganizationId]);

  useEffect(() => {
    setSelectedContactId(null);
  }, [activeOrganizationId]);

  async function handleAssignToMe(contactId: string) {
    if (!currentUser?.organizationUserId) {
      return;
    }

    setAssigningContactId(contactId);
    try {
      await assignContact({
        contactId,
        organizationUserId: currentUser.organizationUserId
      });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } finally {
      setAssigningContactId(null);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1.15fr)_360px]">
      <Card elevated className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Contacts</p>
        <h2 className="mt-3 section-title">Canonical customer records</h2>
        <p className="mt-2 max-w-2xl section-copy">
          Every customer is stored once per organization and can fan out into many WhatsApp identities without duplicating the core record.
        </p>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            {isSuperAdmin ? (
              <div className="min-w-[200px]">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Organization</p>
                <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="h-10">
                  <option value="">Choose organization</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

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

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-white/80">
          <table className="w-full min-w-[560px] bg-white/80">
            <thead className="bg-background-tint text-left text-[10px] uppercase tracking-[0.18em] text-text-soft">
              <tr>
                <th className="px-2.5 py-2">Name</th>
                <th className="px-2.5 py-2">Normalized</th>
                {canAssignContacts ? <th className="px-2.5 py-2">Owner</th> : null}
              </tr>
            </thead>
            <tbody>
              {!canLoadContacts ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={canAssignContacts ? 3 : 2}>
                    Choose an organization to load contacts.
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={canAssignContacts ? 3 : 2}>
                    Loading contacts...
                  </td>
                </tr>
              ) : contactsIsError ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-red-600" colSpan={canAssignContacts ? 3 : 2}>
                    {contactsError instanceof Error ? contactsError.message : "Unable to load contacts."}
                  </td>
                </tr>
              ) : visibleContacts.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={canAssignContacts ? 3 : 2}>
                    {contactSearch.trim() ? "No contacts match your search." : "No contacts found."}
                  </td>
                </tr>
              ) : (
                visibleContacts.map((contact) => (
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
                        <span className="max-w-[180px] truncate font-medium text-text">{contact.display_name ?? "Unknown"}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">{contact.primary_phone_normalized ?? "--"}</td>
                    {canAssignContacts ? (
                      <td className="px-2.5 py-1.5">
                        {contact.owner_user_id === currentUser?.organizationUserId ? (
                          <span className="whitespace-nowrap text-text-soft">Assigned to you</span>
                        ) : (
                          <Button
                            variant="secondary"
                            className="whitespace-nowrap px-2 py-1 text-[11px]"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleAssignToMe(contact.id);
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
      </Card>

      <Card elevated className="xl:sticky xl:top-6 xl:self-start">
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
                <p className="text-lg font-semibold text-text">{selectedContact.display_name ?? "Unknown"}</p>
                <p className="text-sm text-text-muted">{selectedContact.primary_phone_normalized ?? "No normalized number yet"}</p>
                {selectedContact.primary_phone_e164 ? <p className="mt-1 text-xs text-text-soft">{selectedContact.primary_phone_e164}</p> : null}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
              <p>Contact ID: {selectedContact.id}</p>
              <p>
                Owner:{" "}
                {selectedContact.owner_user_id
                  ? selectedContact.owner_user_id === currentUser?.organizationUserId
                    ? "Assigned to you"
                    : selectedContact.owner_user_id
                  : "Unassigned"}
              </p>
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
