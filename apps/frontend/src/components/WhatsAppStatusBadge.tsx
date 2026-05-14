import React from "react";

export type WhatsAppStatus = "connected" | "disconnected" | "connecting";

export function WhatsAppStatusBadge({ status }: { status: WhatsAppStatus }) {
  let color = "bg-muted";
  let tooltip = "Unknown";

  if (status === "connected") {
    color = "bg-success";
    tooltip = "WhatsApp Connected";
  } else if (status === "disconnected") {
    color = "bg-destructive";
    tooltip = "WhatsApp Disconnected";
  } else if (status === "connecting") {
    color = "bg-warning";
    tooltip = "WhatsApp Connecting";
  }

  return (
    <span
      className={`whatsapp-connection-dot ml-2 inline-block h-3 w-3 rounded-full border border-card shadow ${color}`}
      title={tooltip}
      aria-label={tooltip}
    />
  );
}
