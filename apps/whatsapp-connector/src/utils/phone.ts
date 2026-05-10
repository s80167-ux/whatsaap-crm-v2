export function normalizePhoneNumber(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  const digits = input.replace(/[^\d]/g, "");

  if (!digits) {
    return null;
  }

  if (digits.startsWith("60")) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    return `+60${digits.slice(1)}`;
  }

  return `+${digits}`;
}

export type WhatsAppJidType = "phone" | "lid" | "group" | "broadcast" | "status" | "newsletter" | "unknown";

const WHATSAPP_JID_PATTERN = /[a-zA-Z0-9._:+-]+@(s\.whatsapp\.net|c\.us|lid|g\.us|broadcast|newsletter)/i;

function normalizeJidLocalPart(localPart: string, type: WhatsAppJidType) {
  const trimmed = localPart.trim();

  if (type === "phone" || type === "lid") {
    return trimmed.split(":")[0].toLowerCase();
  }

  return trimmed.toLowerCase();
}

export function normalizeWhatsAppJid(jid: string | null | undefined): string | null {
  if (!jid) {
    return null;
  }

  const match = jid.trim().match(WHATSAPP_JID_PATTERN);

  if (!match) {
    return null;
  }

  const rawJid = match[0].toLowerCase();
  const [localPart, domain] = rawJid.split("@");
  const type = getWhatsAppJidType(rawJid);

  return `${normalizeJidLocalPart(localPart, type)}@${domain}`;
}

export function getWhatsAppJidType(jid: string | null | undefined): WhatsAppJidType {
  const normalized = jid?.trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (normalized === "status@broadcast") {
    return "status";
  }

  if (normalized.endsWith("@g.us")) {
    return "group";
  }

  if (normalized.endsWith("@broadcast")) {
    return "broadcast";
  }

  if (normalized.endsWith("@newsletter")) {
    return "newsletter";
  }

  if (normalized.endsWith("@lid")) {
    return "lid";
  }

  if (normalized.endsWith("@s.whatsapp.net") || normalized.endsWith("@c.us")) {
    const localPart = normalized.split("@")[0].split(":")[0];
    return /^\d+$/.test(localPart) ? "phone" : "unknown";
  }

  return "unknown";
}

export function isWhatsAppPhoneJid(jid: string | null | undefined): boolean {
  return getWhatsAppJidType(jid) === "phone";
}

export function isWhatsAppDirectChatJid(jid: string | null | undefined): boolean {
  const type = getWhatsAppJidType(jid);
  return type === "phone" || type === "lid";
}

export function jidToPhone(jid: string | null | undefined): string | null {
  const normalizedJid = normalizeWhatsAppJid(jid);

  if (!normalizedJid || getWhatsAppJidType(normalizedJid) !== "phone") {
    return null;
  }

  const phone = normalizedJid.split("@")[0];
  return normalizePhoneNumber(phone);
}

function addJidCandidate(candidates: Set<string>, value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const normalizedJid = normalizeWhatsAppJid(value);

  if (!normalizedJid) {
    return;
  }

  const type = getWhatsAppJidType(normalizedJid);

  if (type === "phone" || type === "lid") {
    candidates.add(normalizedJid);
  }
}

function walkForJidCandidates(value: unknown, candidates: Set<string>, depth = 0) {
  if (depth > 4 || !value || typeof value !== "object") {
    return;
  }

  for (const [fieldName, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof fieldValue === "string") {
      const fieldLooksUseful =
        /jid|participant|senderpn|participantpn|remotejid|remotejidalt|participantalt/i.test(fieldName) ||
        WHATSAPP_JID_PATTERN.test(fieldValue);

      if (fieldLooksUseful) {
        addJidCandidate(candidates, fieldValue);
      }
      continue;
    }

    if (fieldValue && typeof fieldValue === "object" && /key|participant|context|sender|jid/i.test(fieldName)) {
      walkForJidCandidates(fieldValue, candidates, depth + 1);
    }
  }
}

export function extractAllWhatsAppJidCandidates(payload: unknown): string[] {
  const key =
    payload && typeof payload === "object" && "key" in payload
      ? (payload as { key?: Record<string, unknown> }).key
      : null;

  const candidates = new Set<string>();
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const priorityCandidates = [
    key?.remoteJid,
    key?.participant,
    key?.senderPn,
    key?.participantPn,
    key?.remoteJidAlt,
    key?.participantAlt,
    root?.participant,
    root?.senderPn,
    root?.participantPn,
    root?.remoteJidAlt,
    root?.participantAlt
  ];

  for (const candidate of priorityCandidates) {
    addJidCandidate(candidates, candidate);
  }

  walkForJidCandidates(key, candidates);
  walkForJidCandidates(root, candidates);

  return [...candidates];
}

export function extractAllPhoneCandidatesFromWhatsAppPayload(payload: unknown): string[] {
  const key =
    payload && typeof payload === "object" && "key" in payload
      ? (payload as { key?: Record<string, unknown> }).key
      : null;
  const remoteJid = typeof key?.remoteJid === "string" ? key.remoteJid : null;

  if (remoteJid && !isWhatsAppDirectChatJid(remoteJid)) {
    return [];
  }

  const candidates = new Set<string>();

  for (const jid of extractAllWhatsAppJidCandidates(payload)) {
    const phone = jidToPhone(jid);

    if (phone) {
      candidates.add(phone);
    }
  }

  return [...candidates];
}

export function bestPhoneFromWhatsAppPayload(payload: unknown): string | null {
  const candidates = extractAllPhoneCandidatesFromWhatsAppPayload(payload);

  for (const candidate of candidates) {
    if (candidate.startsWith("+60")) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}

export function bestPhoneFromWhatsAppMessageKey(key: Record<string, unknown> | null | undefined): string | null {
  return bestPhoneFromWhatsAppPayload({ key });
}
