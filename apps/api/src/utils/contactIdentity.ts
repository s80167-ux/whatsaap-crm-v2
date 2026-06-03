import type { WhatsAppJidType } from "./phone.js";

const WEAK_DISPLAY_NAMES = new Set([
  "unknown",
  "unknown contact",
  "customer",
  "no name",
  "noname",
  "whatsapp",
  "business",
  "user",
  "device",
  "iphone",
  "android",
  "test",
  "admin",
  "contact"
]);

export type ContactIdentityQuality = "strong" | "normal" | "weak" | "lid_only" | "phone_verified";
export type ContactIdentityStatus = "resolved" | "provisional" | "needs_phone" | "needs_merge_review";

export function normalizeDisplayName(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeComparableDigits(value: string | null | undefined): string | null {
  const normalized = normalizeDisplayName(value);
  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function isWeakDisplayName(value: string | null | undefined, phone?: string | null): boolean {
  const normalized = normalizeDisplayName(value);

  if (!normalized) {
    return true;
  }

  const lower = normalized.toLowerCase();

  if (WEAK_DISPLAY_NAMES.has(lower)) {
    return true;
  }

  if (/^(unknown|customer|contact|user|device|business)(\s*[-_#:]?\s*\d+)?$/i.test(normalized)) {
    return true;
  }

  if (/^(iphone|android|samsung|xiaomi|oppo|vivo|huawei|realme)(\s+device)?$/i.test(normalized)) {
    return true;
  }

  if (/(@s\.whatsapp\.net|@c\.us|@g\.us|@lid)$/i.test(normalized)) {
    return true;
  }

  if (/^\+?\d{6,15}$/.test(normalized.replace(/\s+/g, ""))) {
    return true;
  }

  const nameDigits = normalizeComparableDigits(normalized);
  const phoneDigits = normalizeComparableDigits(phone);

  if (phoneDigits && nameDigits && nameDigits === phoneDigits) {
    return true;
  }

  return false;
}

export function isBlockedDisplayName(
  value: string | null | undefined,
  blockedNames: Array<string | null | undefined> = []
): boolean {
  const normalized = normalizeDisplayName(value);

  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  return blockedNames.some((blockedName) => normalizeDisplayName(blockedName)?.toLowerCase() === lower);
}

export function isBetterDisplayName(
  candidate: string | null | undefined,
  existing: string | null | undefined,
  context: { blockedNames?: Array<string | null | undefined>; candidateScore?: number; existingScore?: number; phone?: string | null } = {}
): boolean {
  const candidateName = normalizeDisplayName(candidate);

  if (!candidateName || isWeakDisplayName(candidateName, context.phone) || isBlockedDisplayName(candidateName, context.blockedNames)) {
    return false;
  }

  const existingName = normalizeDisplayName(existing);

  if (!existingName || isWeakDisplayName(existingName, context.phone) || isBlockedDisplayName(existingName, context.blockedNames)) {
    return true;
  }

  return (context.candidateScore ?? 0) > (context.existingScore ?? 0);
}

export function sanitizeWhatsAppDisplayName(
  value: string | null | undefined,
  blockedNames: Array<string | null | undefined> = [],
  phone?: string | null
): string | null {
  const normalized = normalizeDisplayName(value);
  return normalized && !isWeakDisplayName(normalized, phone) && !isBlockedDisplayName(normalized, blockedNames) ? normalized : null;
}

export function chooseBestDisplayName(input: {
  existingName: string | null | undefined;
  incomingName: string | null | undefined;
  phone?: string | null;
  blockedNames?: Array<string | null | undefined>;
  incomingScore?: number;
  existingScore?: number;
}): string | null {
  const existingName = normalizeDisplayName(input.existingName);
  const incomingName = normalizeDisplayName(input.incomingName);

  if (!incomingName || isWeakDisplayName(incomingName, input.phone) || isBlockedDisplayName(incomingName, input.blockedNames)) {
    return existingName;
  }

  if (!existingName || isWeakDisplayName(existingName, input.phone) || isBlockedDisplayName(existingName, input.blockedNames)) {
    return incomingName;
  }

  return (input.incomingScore ?? 0) > (input.existingScore ?? 0) ? incomingName : existingName;
}

export function scoreContactIdentity(input: {
  normalizedPhone: string | null;
  displayName: string | null;
  profileAvatarUrl?: string | null;
  jidType: WhatsAppJidType;
}) {
  const hasPhone = Boolean(input.normalizedPhone);
  const hasAvatar = Boolean(normalizeDisplayName(input.profileAvatarUrl ?? null));
  const weakName = isWeakDisplayName(input.displayName, input.normalizedPhone);
  let score = 0;

  if (hasPhone) score += 50;
  if (!weakName) score += 20;
  if (hasAvatar) score += 10;
  if (input.jidType === "phone") score += 20;
  if (input.jidType === "lid" && !hasPhone) score -= 30;
  if (weakName) score -= 30;
  if (hasAvatar && !hasPhone) score -= 20;

  const identityQuality: ContactIdentityQuality =
    input.jidType === "lid" && !hasPhone
      ? "lid_only"
      : hasPhone && input.jidType === "phone"
        ? "phone_verified"
        : score >= 70
          ? "strong"
          : score >= 40
            ? "normal"
            : "weak";

  const contactStatus: ContactIdentityStatus =
    hasAvatar && !hasPhone
      ? "needs_phone"
      : input.jidType === "lid" && !hasPhone
        ? "needs_phone"
        : identityQuality === "weak"
          ? "provisional"
          : "resolved";

  return { score, identityQuality, contactStatus };
}
