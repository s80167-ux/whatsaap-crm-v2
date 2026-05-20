import { getWhatsAppJidType, jidToPhone, normalizePhoneNumber, normalizeWhatsAppJid } from "./phone.js";

export type NormalizedWhatsAppIdentity = {
  rawJid: string;
  normalizedJid: string | null;
  phoneNumber: string | null;
  lid: string | null;
  jidType: "user" | "group" | "lid" | "broadcast" | "status" | "newsletter" | "unknown";
  isValidCustomerIdentity: boolean;
};

const UNKNOWN_NAMES = new Set(["unknown", "unknown contact", "undefined", "null"]);

export function isUnknownOrEmptyName(value: string | null | undefined): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 || UNKNOWN_NAMES.has(normalized.toLowerCase());
}

export function normalizeWhatsAppIdentity(inputJid: string | null | undefined): NormalizedWhatsAppIdentity {
  const rawJid = typeof inputJid === "string" ? inputJid.trim() : "";
  const normalizedJid = normalizeWhatsAppJid(rawJid);
  const phoneJid = normalizedJid && getWhatsAppJidType(normalizedJid) === "phone" ? normalizedJid : null;
  const phoneNumber = jidToPhone(phoneJid);
  const rawType = getWhatsAppJidType(normalizedJid ?? rawJid);
  const jidType =
    rawType === "phone"
      ? "user"
      : rawType === "group"
        ? "group"
        : rawType === "lid"
          ? "lid"
          : rawType;

  return {
    rawJid,
    normalizedJid,
    phoneNumber,
    lid: rawType === "lid" ? normalizedJid : null,
    jidType,
    isValidCustomerIdentity: rawType === "phone" || rawType === "lid"
  };
}

function hasUsefulName(value: string | null | undefined) {
  return !isUnknownOrEmptyName(value);
}

export function calculateContactQualityScore(candidate: {
  normalizedJid?: string | null;
  rawJid?: string | null;
  lid?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  pushName?: string | null;
  verifiedName?: string | null;
  notifyName?: string | null;
  profilePicUrl?: string | null;
  source?: string | null;
}) {
  const identity = normalizeWhatsAppIdentity(candidate.normalizedJid ?? candidate.rawJid ?? null);
  const normalizedPhone = normalizePhoneNumber(candidate.phoneNumber) ?? identity.phoneNumber;
  let score = 0;

  if (normalizedPhone) score += 40;
  if (identity.normalizedJid || candidate.normalizedJid) score += 30;
  if (candidate.lid || identity.lid) score += 20;
  if (hasUsefulName(candidate.displayName) || hasUsefulName(candidate.pushName)) score += 15;
  if (hasUsefulName(candidate.notifyName)) score += 10;
  if (hasUsefulName(candidate.verifiedName)) score += 20;
  if (typeof candidate.profilePicUrl === "string" && candidate.profilePicUrl.trim().length > 0) score += 10;

  switch (candidate.source) {
    case "history_sync":
      score += 10;
      break;
    case "baileys_snapshot":
      score += 8;
      break;
    case "active_profile_fetch":
      score += 8;
      break;
    case "live_message":
      score += 5;
      break;
  }

  return Math.min(score, 100);
}

export function normalizeRecoveryPhone(value: string | null | undefined) {
  return normalizePhoneNumber(value);
}

export function pickBestRecoveryName(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!isUnknownOrEmptyName(value)) {
      return value!.replace(/\s+/g, " ").trim();
    }
  }

  return null;
}
