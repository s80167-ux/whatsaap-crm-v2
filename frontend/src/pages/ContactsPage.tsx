import { motion } from "framer-motion";
import { Card } from "../components/Card";
import { useContacts } from "../hooks/useContacts";

export function ContactsPage() {
  const { data: contacts = [], isLoading } = useContacts();

  return (
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
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-5 py-6 text-sm text-text-muted" colSpan={3}>
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
                  className="table-row text-sm text-text-muted"
                >
                  <td className="px-5 py-4 font-medium text-text">{contact.display_name ?? "Unknown"}</td>
                  <td className="px-5 py-4">{contact.primary_phone_e164 ?? "--"}</td>
                  <td className="px-5 py-4">{contact.primary_phone_normalized ?? "--"}</td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
