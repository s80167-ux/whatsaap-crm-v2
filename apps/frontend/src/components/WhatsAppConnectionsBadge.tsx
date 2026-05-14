import React from "react";
import type { WhatsAppAccountSummary } from "../types/admin";

export function WhatsAppConnectionsBadge({ accounts }: { accounts: WhatsAppAccountSummary[] }) {
  // Show up to 5 dots, then a "+N" if more
  const maxDots = 5;
  const shown = accounts.slice(0, maxDots);
  const extra = accounts.length - maxDots;

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {shown.map((acc) => {
        let color = "bg-muted";
        if (acc.status === "connected") color = "bg-success";
        else if (acc.status === "disconnected") color = "bg-destructive";
        else if (acc.status === "connecting" || acc.status === "initializing") color = "bg-warning";
        return (
          <span
            key={acc.id}
            className={`whatsapp-connection-dot inline-block h-2.5 w-2.5 rounded-full border border-card shadow ${color}`}
            title={acc.name || acc.phone_number || acc.id}
          />
        );
      })}
      {extra > 0 && (
        <span className="ml-1 whitespace-nowrap text-xs font-semibold text-text-soft">+{extra}</span>
      )}
    </span>
  );
}
