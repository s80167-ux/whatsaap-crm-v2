import type {
  AudienceColumnMapping,
  AudienceColumnMappingSuggestion,
  AudienceCsvField,
  AudienceCsvRow,
  AudienceGender,
  AudienceValidatedContact,
  AudienceValidationResult
} from "../types/audienceGroup.types";
import { normalizeMalaysiaPhone } from "./phoneNormalization";

const CSV_FIELDS: AudienceCsvField[] = [
  "name",
  "phone",
  "gender",
  "tag",
  "location",
  "product_interest",
  "customer_type",
  "notes"
];

const HEADER_ALIASES: Record<AudienceCsvField, string[]> = {
  name: [
    "name",
    "full name",
    "customer name",
    "contact name",
    "client name",
    "display name",
    "nama",
    "nama penuh",
    "nama pelanggan",
    "nama customer",
    "nama contact",
    "nama penerima",
    "penerima"
  ],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "mobile no",
    "contact number",
    "contact no",
    "telephone",
    "tel",
    "hp",
    "handphone",
    "whatsapp",
    "whatsapp number",
    "wa number",
    "whatsapp no",
    "no telefon",
    "nombor telefon",
    "no hp",
    "nombor hp",
    "no whatsapp",
    "nombor whatsapp",
    "telefon pelanggan",
    "nombor untuk dihubungi",
    "phone no",
    "telefon",
    "nombor telefon bimbit"
  ],
  gender: ["gender", "sex", "jantina", "lelaki perempuan"],
  tag: ["tag", "tags", "label", "segment", "category", "kategori", "kumpulan", "segmen"],
  location: ["location", "city", "state", "area", "address", "town", "lokasi", "bandar", "negeri", "kawasan", "alamat"],
  product_interest: [
    "product interest",
    "interested product",
    "product",
    "interest",
    "product interested",
    "produk minat",
    "minat produk",
    "produk diminati",
    "produk yang diminati",
    "servis diminati"
  ],
  customer_type: [
    "customer type",
    "client type",
    "contact type",
    "customer segment",
    "jenis pelanggan",
    "kategori pelanggan",
    "jenis customer",
    "segmen pelanggan"
  ],
  notes: ["notes", "note", "remarks", "remark", "comments", "comment", "description", "catatan", "nota", "keterangan", "komen"]
};

const FIELD_CONFIDENCE_THRESHOLDS = {
  high: 90,
  medium: 72
} as const;

const SAMPLE_SIZE = 20;

export const audienceCsvFields = CSV_FIELDS;

export function parseAudienceCsv(content: string): { headers: string[]; rows: AudienceCsvRow[] } {
  const records = parseCsvRecords(content).filter((record) => record.some((value) => value.trim().length > 0));

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0].map((header) => header.trim()).filter(Boolean);
  const rows = records.slice(1).map((record, index) => {
    const values: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      values[header] = record[headerIndex]?.trim() ?? "";
    });

    return {
      rowNumber: index + 2,
      values
    };
  });

  return { headers, rows };
}

export function autoMapAudienceColumns(headers: string[], rows: AudienceCsvRow[] = []): AudienceColumnMapping {
  return suggestAudienceColumnMapping(headers, rows).mapping;
}

export function suggestAudienceColumnMapping(headers: string[], rows: AudienceCsvRow[] = []): {
  mapping: AudienceColumnMapping;
  suggestions: AudienceColumnMappingSuggestion[];
} {
  const normalizedHeaders = headers.map((header) => buildNormalizedHeader(header));
  const candidates: AudienceColumnMappingSuggestion[] = [];
  const usedHeaders = new Set<string>();

  for (const field of CSV_FIELDS) {
    const headerMatch = findBestHeaderMatch(field, normalizedHeaders);
    const sampleMatch = findSampleInference(field, headers, rows);
    const bestMatch = pickBestSuggestion(field, headerMatch, sampleMatch);
    candidates.push(bestMatch);
  }

  const suggestions: AudienceColumnMappingSuggestion[] = [...candidates]
    .sort((left, right) => right.score - left.score)
    .map((suggestion) => {
      if (!suggestion.sourceHeader || suggestion.score < FIELD_CONFIDENCE_THRESHOLDS.medium || usedHeaders.has(suggestion.sourceHeader)) {
        return {
          field: suggestion.field,
          sourceHeader: undefined,
          confidence: "low",
          score: suggestion.score,
          reason: suggestion.sourceHeader ? suggestion.reason : "unmatched"
        } satisfies AudienceColumnMappingSuggestion;
      }

      usedHeaders.add(suggestion.sourceHeader);
      return suggestion;
    })
    .sort((left, right) => CSV_FIELDS.indexOf(left.field) - CSV_FIELDS.indexOf(right.field));

  return {
    mapping: suggestions.reduce<AudienceColumnMapping>((mapping, suggestion) => {
      if (suggestion.sourceHeader) {
        mapping[suggestion.field] = suggestion.sourceHeader;
      }
      return mapping;
    }, {}),
    suggestions
  };
}

export function validateAudienceRows(input: {
  headers: string[];
  rows: AudienceCsvRow[];
  mapping: AudienceColumnMapping;
  existingAudiencePhones?: Set<string>;
  crmPhones?: Map<string, string>;
  optedOutPhones?: Set<string>;
}): AudienceValidationResult {
  const seenPhones = new Set<string>();
  const warnings = new Set<string>();

  const contacts: AudienceValidatedContact[] = input.rows.map((row) => {
    const phoneRaw = getMappedValue(row, input.mapping.phone);
    const normalizedPhone = normalizeMalaysiaPhone(phoneRaw);
    const issues: string[] = [];
    const rowWarnings: string[] = [];

    if (!normalizedPhone.isValid) {
      issues.push(normalizedPhone.reason);
    }

    const name = emptyToNull(getMappedValue(row, input.mapping.name));
    if (!name) {
      rowWarnings.push("Name is empty");
      warnings.add("Some contacts do not have a name.");
    }

    const normalized = normalizedPhone.normalized;
    const isDuplicateInCsv = normalized ? seenPhones.has(normalized) : false;
    const isDuplicateInAudienceGroup = normalized ? input.existingAudiencePhones?.has(normalized) === true : false;
    const isOptedOut = normalized ? input.optedOutPhones?.has(normalized) === true : false;

    if (normalized) {
      seenPhones.add(normalized);
    }

    if (isDuplicateInCsv) {
      issues.push("Duplicate phone in CSV");
    }

    if (isDuplicateInAudienceGroup) {
      issues.push("Duplicate already exists in Audience Group");
    }

    if (isOptedOut) {
      issues.push("Contact is suppressed or opted out");
    }

    const gender = normalizeGender(getMappedValue(row, input.mapping.gender));
    const crmContactId = normalized ? input.crmPhones?.get(normalized) ?? null : null;

    return {
      rowNumber: row.rowNumber,
      name,
      phone_raw: phoneRaw,
      phone_normalized: normalized,
      gender,
      tag: emptyToNull(getMappedValue(row, input.mapping.tag)),
      location: emptyToNull(getMappedValue(row, input.mapping.location)),
      product_interest: emptyToNull(getMappedValue(row, input.mapping.product_interest)),
      customer_type: emptyToNull(getMappedValue(row, input.mapping.customer_type)),
      notes: emptyToNull(getMappedValue(row, input.mapping.notes)),
      raw_data_json: row.values,
      validation_status: issues.length > 0 ? "invalid" : "valid",
      validation_issues: issues,
      warnings: rowWarnings,
      is_duplicate: isDuplicateInCsv || isDuplicateInAudienceGroup,
      is_opted_out: isOptedOut,
      exclude_reason: issues[0] ?? null,
      crm_contact_id: crmContactId
    };
  });

  return {
    headers: input.headers,
    rows: input.rows,
    contacts,
    totalRows: contacts.length,
    validContacts: contacts.filter((contact) => contact.validation_status === "valid").length,
    invalidContacts: contacts.filter((contact) => contact.validation_status === "invalid").length,
    duplicatesInCsv: contacts.filter((contact) => contact.validation_issues.includes("Duplicate phone in CSV")).length,
    duplicatesInAudienceGroup: contacts.filter((contact) =>
      contact.validation_issues.includes("Duplicate already exists in Audience Group")
    ).length,
    linkedCrmContacts: contacts.filter((contact) => Boolean(contact.crm_contact_id)).length,
    optOutBlocked: contacts.filter((contact) => contact.is_opted_out).length,
    suppressedContacts: contacts.filter((contact) => contact.is_opted_out).length,
    warnings: Array.from(warnings)
  };
}

export function buildAudienceSampleCsv() {
  return [
    "name,phone,gender,tag,location,product_interest,customer_type,notes",
    "Aina,+60123456789,female,vip,Shah Alam,Package A,returning,Interested in promo",
    "Badrul,0123456789,male,new,Kuala Lumpur,Package B,new,Follow up next week"
  ].join("\n");
}

export function buildAudienceErrorReport(result: AudienceValidationResult) {
  const headers = ["row_number", "name", "phone", "issues", "warnings"];
  const rows = result.contacts
    .filter((contact) => contact.validation_status === "invalid" || contact.warnings.length > 0)
    .map((contact) => [
      String(contact.rowNumber),
      contact.name ?? "",
      contact.phone_raw,
      contact.validation_issues.join("; "),
      contact.warnings.join("; ")
    ]);

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function parseCsvRecords(content: string) {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRecord.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRecord.push(currentCell);
      records.push(currentRecord);
      currentRecord = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  currentRecord.push(currentCell);
  records.push(currentRecord);

  return records;
}

function getMappedValue(row: AudienceCsvRow, header?: string) {
  if (!header) {
    return "";
  }

  return row.values[header] ?? "";
}

function normalizeGender(value: string): AudienceGender {
  const normalized = normalizeLooseText(value);
  if (["male", "lelaki", "m", "man"].includes(normalized)) {
    return "male";
  }

  if (["female", "perempuan", "f", "woman"].includes(normalized)) {
    return "female";
  }

  return "unknown";
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

type NormalizedHeader = {
  original: string;
  normalized: string;
  compact: string;
  tokens: string[];
};

type HeaderMatch = {
  sourceHeader?: string;
  score: number;
  reason: AudienceColumnMappingSuggestion["reason"];
};

function buildNormalizedHeader(header: string): NormalizedHeader {
  const normalized = normalizeHeader(header);
  return {
    original: header,
    normalized,
    compact: normalized.replace(/\s+/g, ""),
    tokens: normalized.split(" ").filter(Boolean)
  };
}

function normalizeHeader(header: string) {
  return normalizeLooseText(header)
    .replace(/[_/\\-]+/g, " ")
    .replace(/[()[\]{}.,:;!?@#$%^&*+=~`|<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseText(value: string) {
  return value.replace(/\uFEFF/g, "").normalize("NFKC").trim().toLowerCase();
}

function findBestHeaderMatch(field: AudienceCsvField, headers: NormalizedHeader[]): HeaderMatch {
  let bestMatch: HeaderMatch = { score: 0, reason: "unmatched" };

  for (const header of headers) {
    const score = scoreHeaderForField(field, header);
    if (score.score > bestMatch.score) {
      bestMatch = {
        sourceHeader: header.original,
        score: score.score,
        reason: score.reason
      };
    }
  }

  return bestMatch;
}

function scoreHeaderForField(field: AudienceCsvField, header: NormalizedHeader): { score: number; reason: AudienceColumnMappingSuggestion["reason"] } {
  const aliases = HEADER_ALIASES[field].map((alias) => buildNormalizedHeader(alias));
  let best: { score: number; reason: AudienceColumnMappingSuggestion["reason"] } = { score: 0, reason: "unmatched" };

  for (const alias of aliases) {
    if (header.normalized === alias.normalized) {
      return { score: 100, reason: "exact_alias" };
    }

    if (header.compact === alias.compact) {
      best = pickHigherScore(best, { score: 96, reason: "exact_alias" });
      continue;
    }

    if (sameTokenSet(header.tokens, alias.tokens)) {
      best = pickHigherScore(best, { score: 92, reason: "token_match" });
      continue;
    }

    if (containsOrderedTokens(header.tokens, alias.tokens)) {
      const score = alias.tokens.length === 1 ? 74 : 84;
      best = pickHigherScore(best, { score, reason: "token_match" });
      continue;
    }

    if (hasStrongTokenOverlap(field, header.tokens, alias.tokens)) {
      best = pickHigherScore(best, { score: 76, reason: "token_match" });
    }
  }

  if (field === "customer_type" && header.normalized === "type") {
    return { score: 0, reason: "unmatched" };
  }

  return best;
}

function findSampleInference(field: AudienceCsvField, headers: string[], rows: AudienceCsvRow[]): HeaderMatch {
  if (field !== "phone" && field !== "gender") {
    return { score: 0, reason: "unmatched" };
  }

  let best: HeaderMatch = { score: 0, reason: "unmatched" };

  for (const header of headers) {
    const values = rows
      .map((row) => row.values[header] ?? "")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, SAMPLE_SIZE);

    if (values.length === 0) {
      continue;
    }

    const candidate = field === "phone" ? inferPhoneColumn(header, values) : inferGenderColumn(header, values);
    if (candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

function inferPhoneColumn(header: string, values: string[]): HeaderMatch {
  const validCount = values.filter((value) => normalizeMalaysiaPhone(value).isValid).length;
  const ratio = validCount / values.length;

  if (values.length >= 3 && validCount >= 2 && ratio >= 0.8) {
    return { sourceHeader: header, score: 82, reason: "sample_phone" };
  }

  if (values.length >= 3 && validCount >= 2 && ratio >= 0.7) {
    return { sourceHeader: header, score: 74, reason: "sample_phone" };
  }

  return { score: 0, reason: "unmatched" };
}

function inferGenderColumn(header: string, values: string[]): HeaderMatch {
  const genderValues = values.filter((value) => normalizeGender(value) !== "unknown").length;
  const ratio = genderValues / values.length;

  if (values.length >= 3 && genderValues >= 2 && ratio >= 0.8) {
    return { sourceHeader: header, score: 76, reason: "sample_gender" };
  }

  return { score: 0, reason: "unmatched" };
}

function pickBestSuggestion(
  field: AudienceCsvField,
  headerMatch: HeaderMatch,
  sampleMatch: HeaderMatch
): AudienceColumnMappingSuggestion {
  const winner = headerMatch.score >= sampleMatch.score ? headerMatch : sampleMatch;

  return {
    field,
    sourceHeader: winner.sourceHeader,
    confidence: toConfidence(winner.score),
    score: winner.score,
    reason: winner.reason
  };
}

function toConfidence(score: number): AudienceColumnMappingSuggestion["confidence"] {
  if (score >= FIELD_CONFIDENCE_THRESHOLDS.high) {
    return "high";
  }

  if (score >= FIELD_CONFIDENCE_THRESHOLDS.medium) {
    return "medium";
  }

  return "low";
}

function pickHigherScore<T extends { score: number }>(left: T, right: T) {
  return right.score > left.score ? right : left;
}

function sameTokenSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return left.every((token) => rightSet.has(token)) && right.every((token) => leftSet.has(token));
}

function containsOrderedTokens(headerTokens: string[], aliasTokens: string[]) {
  if (aliasTokens.length === 0 || aliasTokens.length > headerTokens.length) {
    return false;
  }

  let aliasIndex = 0;
  for (const token of headerTokens) {
    if (token === aliasTokens[aliasIndex]) {
      aliasIndex += 1;
      if (aliasIndex === aliasTokens.length) {
        return true;
      }
    }
  }

  return false;
}

function hasStrongTokenOverlap(field: AudienceCsvField, headerTokens: string[], aliasTokens: string[]) {
  if (aliasTokens.length < 2) {
    return false;
  }

  const overlap = aliasTokens.filter((token) => headerTokens.includes(token));
  if (overlap.length < 2) {
    return false;
  }

  const overlapRatio = overlap.length / aliasTokens.length;
  if (overlapRatio < 0.75) {
    return false;
  }

  // Avoid weak catch-alls like "type" from silently winning without context.
  if (field === "customer_type" && !headerTokens.some((token) => ["customer", "client", "contact", "pelanggan", "segment", "segmen", "kategori", "jenis"].includes(token))) {
    return false;
  }

  return true;
}
