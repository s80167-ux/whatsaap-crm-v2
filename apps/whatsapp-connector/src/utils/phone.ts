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

export function isWhatsAppPhoneJid(jid: string | null | undefined): boolean {
  return Boolean(jid?.includes("@s.whatsapp.net"));
}

export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid || !isWhatsAppPhoneJid(jid)) {
    return null;
  }

  const phone = jid.split("@")[0].split(":")[0];
  return normalizePhoneNumber(phone);
}

export function bestPhoneFromWhatsAppMessageKey(key: Record<string, unknown> | null | undefined): string | null {
  const candidates = [
    key?.senderPn,
    key?.participantPn,
    key?.participant,
    key?.remoteJid
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const phone = jidToPhone(candidate);

    if (phone) {
      return phone;
    }
  }

  return null;
}
