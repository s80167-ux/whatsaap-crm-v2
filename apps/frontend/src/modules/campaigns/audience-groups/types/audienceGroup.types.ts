export type AudienceGroupStatus = "draft" | "imported" | "failed";

export type AudienceGender = "male" | "female" | "unknown";

export type AudienceCsvField =
  | "name"
  | "phone"
  | "gender"
  | "tag"
  | "location"
  | "product_interest"
  | "customer_type"
  | "notes";

export type AudienceColumnMapping = Partial<Record<AudienceCsvField, string>>;

export interface AudienceGroup {
  id: string;
  organization_id?: string | null;
  name: string;
  description?: string | null;
  source: "csv" | string;
  status: AudienceGroupStatus;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  opt_out_count: number;
  linked_crm_count: number;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AudienceCsvRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface AudienceValidatedContact {
  rowNumber: number;
  name: string | null;
  phone_raw: string;
  phone_normalized: string | null;
  gender: AudienceGender;
  tag: string | null;
  location: string | null;
  product_interest: string | null;
  customer_type: string | null;
  notes: string | null;
  validation_status: "valid" | "invalid";
  validation_issues: string[];
  warnings: string[];
  is_duplicate: boolean;
  is_opted_out: boolean;
  crm_contact_id?: string | null;
}

export interface AudienceValidationResult {
  headers: string[];
  rows: AudienceCsvRow[];
  contacts: AudienceValidatedContact[];
  totalRows: number;
  validContacts: number;
  invalidContacts: number;
  duplicatesInCsv: number;
  duplicatesInAudienceGroup: number;
  linkedCrmContacts: number;
  optOutBlocked: number;
  warnings: string[];
}

export interface CreateAudienceGroupInput {
  name: string;
  description?: string | null;
  organizationId?: string | null;
  totalRows?: number;
  validCount?: number;
  invalidCount?: number;
  duplicateCount?: number;
  optOutCount?: number;
  linkedCrmCount?: number;
}

export interface ImportAudienceGroupInput {
  audienceGroupId: string;
  organizationId?: string | null;
  contacts: AudienceValidatedContact[];
  addValidNewContactsToCrm: boolean;
}
