export type PhoneNormalizationResult =
  | {
      isValid: true;
      normalized: string;
      reason: null;
    }
  | {
      isValid: false;
      normalized: null;
      reason: string;
    };

export function normalizeMalaysiaPhone(input: string): PhoneNormalizationResult {
  const raw = input.trim();

  if (!raw) {
    return { isValid: false, normalized: null, reason: "Phone is required" };
  }

  const compact = raw.replace(/[\s().-]/g, "");
  const withoutPlus = compact.startsWith("+") ? compact.slice(1) : compact;

  if (!/^\d+$/.test(withoutPlus)) {
    return { isValid: false, normalized: null, reason: "Phone contains unsupported characters" };
  }

  let normalized = withoutPlus;

  if (withoutPlus.startsWith("0")) {
    normalized = `60${withoutPlus.slice(1)}`;
  }

  if (!normalized.startsWith("60")) {
    return { isValid: false, normalized: null, reason: "Phone must be a Malaysia number" };
  }

  if (!/^60\d{8,10}$/.test(normalized)) {
    return { isValid: false, normalized: null, reason: "Phone length is invalid" };
  }

  return { isValid: true, normalized, reason: null };
}
