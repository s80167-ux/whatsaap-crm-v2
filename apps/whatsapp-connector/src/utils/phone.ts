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

export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) {
    return null;
  }

  const phone = jid.split("@")[0];
  return normalizePhoneNumber(phone);
}
