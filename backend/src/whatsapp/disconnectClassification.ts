import { DisconnectReason } from "baileys";

export type WhatsAppDisconnectClassification =
  | "normal_disconnect"
  | "logged_out"
  | "qr_required"
  | "reconnect_suppressed"
  | "suspected_ban";

const SUSPECTED_BAN_PATTERNS = [
  /\bban(?:ned)?\b/i,
  /\bblocked?\b/i,
  /\bforbidden\b/i,
  /\brate(?:\s+limit(?:ed)?)?\b/i,
  /\bpolicy\b/i,
  /\bnot\s+authori[sz]ed\b/i
];

export function normalizeDisconnectErrorMessage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function classifyWhatsAppDisconnect(input: {
  statusCode: number | null;
  errorMessage: string | null;
  hadConnected: boolean;
  consecutiveReconnectFailures: number;
  maxConsecutiveReconnectFailures: number;
  hasExistingCreds: boolean;
  qrRequiredRecently?: boolean;
}) {
  const suspiciousMessage = Boolean(input.errorMessage) && SUSPECTED_BAN_PATTERNS.some((pattern) => pattern.test(input.errorMessage!));
  const repeatedFailuresExceeded = input.consecutiveReconnectFailures >= input.maxConsecutiveReconnectFailures;
  const loggedOut = input.statusCode === DisconnectReason.loggedOut;

  if (suspiciousMessage || (loggedOut && input.hadConnected) || (input.qrRequiredRecently && input.consecutiveReconnectFailures >= 2)) {
    return { classification: "suspected_ban" as const, shouldReconnect: false };
  }

  if (loggedOut && !input.hasExistingCreds) {
    return { classification: "qr_required" as const, shouldReconnect: false };
  }

  if (loggedOut) {
    return { classification: "logged_out" as const, shouldReconnect: false };
  }

  if (repeatedFailuresExceeded) {
    return { classification: "reconnect_suppressed" as const, shouldReconnect: false };
  }

  return { classification: "normal_disconnect" as const, shouldReconnect: true };
}
