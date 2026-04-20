import { motion } from "framer-motion";
import type { Conversation } from "../types/api";
import { Card } from "./Card";

export function ContactInfoPanel({ conversation }: { conversation?: Conversation }) {
  return (
    <Card className="h-full bg-white" elevated>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Contact</p>
      {conversation ? (
        <div className="mt-6 space-y-4">
          <div>
            <p className="text-lg font-semibold text-text">{conversation.contact_name}</p>
            <p className="text-sm text-text-muted">{conversation.phone_number_normalized ?? "No normalized number yet"}</p>
          </div>
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
        <p className="mt-6 text-sm leading-6 text-text-muted">
          Select a thread to inspect the canonical contact and conversation metadata.
        </p>
      )}
    </Card>
  );
}
