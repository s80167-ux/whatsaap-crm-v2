import React from "react";

export type WhatsAppStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "logged_out"
  | "reconnect_suppressed"
  | "suspected_ban";

export function WhatsAppStatusBadge({ status }: { status: WhatsAppStatus }) {
  let color = "bg-muted";
  let tooltip = "Unknown";

  if (status === "connected") {
    color = "bg-success";
    tooltip = "WhatsApp Connected";
  } else if (status === "suspected_ban") {
    color = "bg-destructive";
    tooltip = "WhatsApp may be blocked or temporarily banned";
  } else if (status === "reconnect_suppressed") {
    color = "bg-warning";
    tooltip = "WhatsApp auto reconnect is suppressed";
  } else if (status === "logged_out") {
    color = "bg-warning";
    tooltip = "WhatsApp session logged out";
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
