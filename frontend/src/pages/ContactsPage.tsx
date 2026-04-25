import { motion } from "framer-motion";
import { useState } from "react";
import { getStoredUser } from "../lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { assignContact } from "../api/crm";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { useContact, useContacts } from "../hooks/useContacts";
import { getStoredUser } from "../lib/auth";

  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const [assigningContactId, setAssigningContactId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const { data: contacts = [], isLoading } = useContacts();
  const { data: selectedContact } = useContact(selectedContactId ?? undefined);
  const canAssignContacts = Boolean(currentUser?.organizationUserId && currentUser.permissionKeys.includes("contacts.write"));

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

  // Removed Contact Repair Tools admin card

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr),340px]">

      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Contacts</p>
        <h2 className="mt-3 section-title">Canonical customer records</h2>
        <p className="mt-2 max-w-2xl section-copy">
          Every customer is stored once per organization and can fan out into many WhatsApp identities without duplicating the core record.
        </p>
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-white/80">
          <table className="min-w-full bg-white/80">
            <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Primary phone</th>
                <th className="px-5 py-4">Normalized</th>
                {canAssignContacts ? <th className="px-5 py-4">Owner</th> : null}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-text-muted" colSpan={canAssignContacts ? 4 : 3}>
                    Loading contacts...
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <motion.tr
                    key={contact.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="table-row cursor-pointer text-sm text-text-muted"
                    onClick={() => setSelectedContactId(contact.id)}
                  >
                    <td className="px-5 py-4 font-medium text-text">{contact.display_name ?? "Unknown"}</td>
                    <td className="px-5 py-4">{contact.primary_phone_e164 ?? "--"}</td>
                    <td className="px-5 py-4">{contact.primary_phone_normalized ?? "--"}</td>
                    {canAssignContacts ? (
                      <td className="px-5 py-4">
                        {contact.owner_user_id === currentUser?.organizationUserId ? (
                          <span className="text-text-soft">Assigned to you</span>
                        ) : (
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
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

      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Detail</p>
        {selectedContact ? (
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-lg font-semibold text-text">{selectedContact.display_name ?? "Unknown"}</p>
              <p className="text-sm text-text-muted">{selectedContact.primary_phone_normalized ?? "No normalized number yet"}</p>
              {selectedContact.primary_phone_e164 ? <p className="mt-1 text-xs text-text-soft">{selectedContact.primary_phone_e164}</p> : null}
            </div>
            <div className="rounded-xl border border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
              <p>Contact ID: {selectedContact.id}</p>
              <p>
                Owner: {" "}
                {selectedContact.owner_user_id
                  ? selectedContact.owner_user_id === currentUser?.organizationUserId
                    ? "Assigned to you"
                    : selectedContact.owner_user_id
                  : "Unassigned"}
              </p>
              <div className="mt-4">
                <a
                  href={`/contact-repair?contactId=${selectedContact.id}`}
                  className="btn btn-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Contact Repair Tools
                </a>
              </div>
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
