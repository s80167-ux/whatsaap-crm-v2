import React from "react";

export type WhatsAppStatus = "connected" | "disconnected" | "connecting";

export function WhatsAppStatusBadge({ status }: { status: WhatsAppStatus }) {
  let color = "bg-gray-300";
  let tooltip = "Unknown";

  if (status === "connected") {
    color = "bg-green-500";
    tooltip = "WhatsApp Connected";
  } else if (status === "disconnected") {
    color = "bg-red-500";
    tooltip = "WhatsApp Disconnected";
  } else if (status === "connecting") {
    color = "bg-yellow-400";
    tooltip = "WhatsApp Connecting";
  }

  return (
    <span
      className={`whatsapp-connection-dot ml-2 inline-block h-3 w-3 rounded-full border border-white shadow ${color}`}
      title={tooltip}
      aria-label={tooltip}
    />
  );
}
