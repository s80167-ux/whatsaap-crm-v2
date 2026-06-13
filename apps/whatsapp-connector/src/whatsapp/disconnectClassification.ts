import { DisconnectReason } from "baileys";

export type WhatsAppDisconnectClassification =
  | "normal_disconnect"
  | "logged_out"
  | "qr_required"
  | "reconnect_suppressed"
  | "suspected_ban";

export type ClassifyWhatsAppDisconnectInput = {
  statusCode: number | null;
  errorMessage: string | null;
  hadConnected: boolean;
  consecutiveReconnectFailures: number;
  maxConsecutiveReconnectFailures: number;
  hasExistingCreds: boolean;
  qrRequiredRecently?: boolean;
};

export type ClassifiedWhatsAppDisconnect = {
  classification: WhatsAppDisconnectClassification;
  shouldReconnect: boolean;
  autoReconnectSuppressed: boolean;
  suspectedBan: boolean;
};

const SUSPECTED_BAN_PATTERNS = [
  /\bban(?:ned)?\b/i,
  /\bblocked?\b/i,
  /\bforbidden\b/i,
  /\brate(?:\s+limit(?:ed)?)?\b/i,
  /\bpolicy\b/i,
  /\bnot\s+authori[sz]ed\b/i,
  /\brestricted\b/i
];

export function normalizeDisconnectErrorMessage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function containsSuspectedBanSignal(message: string | null) {
  if (!message) {
    return false;
  }

  return SUSPECTED_BAN_PATTERNS.some((pattern) => pattern.test(message));
}

export function classifyWhatsAppDisconnect(
  input: ClassifyWhatsAppDisconnectInput
): ClassifiedWhatsAppDisconnect {
  const suspiciousMessage = containsSuspectedBanSignal(input.errorMessage);
  const repeatedFailuresExceeded = input.consecutiveReconnectFailures >= input.maxConsecutiveReconnectFailures;
  const loggedOut = input.statusCode === DisconnectReason.loggedOut;
  const qrRejectedRepeatedly = Boolean(input.qrRequiredRecently) && input.consecutiveReconnectFailures >= 2;

  if (
    suspiciousMessage ||
    (loggedOut && input.hadConnected) ||
    qrRejectedRepeatedly
  ) {
    return {
      classification: "suspected_ban",
      shouldReconnect: false,
      autoReconnectSuppressed: true,
      suspectedBan: true
    };
  }

  if (loggedOut && !input.hasExistingCreds) {
    return {
      classification: "qr_required",
      shouldReconnect: false,
      autoReconnectSuppressed: true,
      suspectedBan: false
    };
  }

  if (loggedOut) {
    return {
      classification: "logged_out",
      shouldReconnect: false,
      autoReconnectSuppressed: true,
      suspectedBan: false
    };
  }

  if (repeatedFailuresExceeded) {
    return {
      classification: "reconnect_suppressed",
      shouldReconnect: false,
      autoReconnectSuppressed: true,
      suspectedBan: false
    };
  }

  return {
    classification: "normal_disconnect",
    shouldReconnect: true,
    autoReconnectSuppressed: false,
    suspectedBan: false
  };
}
