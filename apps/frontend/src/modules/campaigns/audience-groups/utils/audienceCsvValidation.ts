import type {
  AudienceColumnMapping,
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
  name: ["name", "full_name", "customer_name", "display_name"],
  phone: ["phone", "phone_number", "mobile", "mobile_number", "whatsapp", "whatsapp_number"],
  gender: ["gender", "sex"],
  tag: ["tag", "tags", "segment"],
  location: ["location", "city", "state", "area"],
  product_interest: ["product_interest", "interest", "product"],
  customer_type: ["customer_type", "type", "customer_segment"],
  notes: ["notes", "note", "remarks"]
};

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

export function autoMapAudienceColumns(headers: string[]): AudienceColumnMapping {
  const mapping: AudienceColumnMapping = {};
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header)
  }));

  CSV_FIELDS.forEach((field) => {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedHeaders.find((header) => aliases.includes(header.normalized));

    if (match) {
      mapping[field] = match.original;
    }
  });

  return mapping;
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
      issues.push("Contact is opted out");
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
      validation_status: issues.length > 0 ? "invalid" : "valid",
      validation_issues: issues,
      warnings: rowWarnings,
      is_duplicate: isDuplicateInCsv || isDuplicateInAudienceGroup,
      is_opted_out: isOptedOut,
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

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getMappedValue(row: AudienceCsvRow, header?: string) {
  if (!header) {
    return "";
  }

  return row.values[header] ?? "";
}

function normalizeGender(value: string): AudienceGender {
  const normalized = value.trim().toLowerCase();
  return normalized === "male" || normalized === "female" ? normalized : "unknown";
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
