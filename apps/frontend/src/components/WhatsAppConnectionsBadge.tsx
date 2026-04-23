import React from "react";
import type { WhatsAppAccountSummary } from "../types/admin";

export function WhatsAppConnectionsBadge({ accounts }: { accounts: WhatsAppAccountSummary[] }) {
  // Show up to 5 dots, then a "+N" if more
  const maxDots = 5;
  const shown = accounts.slice(0, maxDots);
  const extra = accounts.length - maxDots;

  return (
    <span className="ml-2 flex items-center gap-0.5">
      {shown.map((acc) => {
        let color = "bg-gray-300";
        if (acc.status === "connected") color = "bg-green-500";
        else if (acc.status === "disconnected") color = "bg-red-500";
        else if (acc.status === "connecting" || acc.status === "initializing") color = "bg-yellow-400";
        return (
          <span
            key={acc.id}
            className={`whatsapp-connection-dot inline-block h-2.5 w-2.5 rounded-full border border-white shadow ${color}`}
            title={acc.name || acc.phone_number || acc.id}
          />
        );
      })}
      {extra > 0 && (
        <span className="ml-1 text-xs text-text-soft font-semibold">+{extra}</span>
      )}
    </span>
  );
}
