export type AudienceGroupStatus = "draft" | "imported" | "failed";
export type AudienceCrmSaveStatus = "not_saved" | "partially_saved" | "saved" | "failed";
export type AudienceStorageStatus = "active" | "archived" | "deleted_details";
export type AudiencePermissionStatus = "not_verified_by_system" | "declared_by_user" | "crm_verified";
export type AudienceRiskLevel = "low" | "medium" | "high";
export type AudienceSourceType =
  | "existing_customers"
  | "form_or_register_leads"
  | "event_booth_walkin"
  | "previous_whatsapp_contact"
  | "referral_partner_list"
  | "cold_public_list"
  | "not_sure";

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

export type AudienceColumnSuggestionConfidence = "high" | "medium" | "low";

export type AudienceColumnSuggestionReason =
  | "exact_alias"
  | "token_match"
  | "sample_phone"
  | "sample_gender"
  | "unmatched";

export interface AudienceColumnMappingSuggestion {
  field: AudienceCsvField;
  sourceHeader?: string;
  confidence: AudienceColumnSuggestionConfidence;
  score: number;
  reason: AudienceColumnSuggestionReason;
}

export interface AudienceGroup {
  id: string;
  organization_id?: string | null;
  name: string;
  description?: string | null;
  source: "csv" | string;
  source_type?: AudienceSourceType | null;
  permission_status?: AudiencePermissionStatus;
  risk_level?: AudienceRiskLevel;
  status: AudienceGroupStatus;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  opt_out_count: number;
  suppressed_count?: number;
  linked_crm_count: number;
  crm_save_status?: AudienceCrmSaveStatus;
  crm_saved_count?: number;
  crm_created_count?: number;
  crm_linked_count?: number;
  crm_skipped_count?: number;
  crm_save_requested_at?: string | null;
  crm_saved_at?: string | null;
  crm_saved_by?: string | null;
  storage_status?: AudienceStorageStatus;
  archived_at?: string | null;
  archived_by?: string | null;
  details_deleted_at?: string | null;
  details_deleted_by?: string | null;
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
  raw_data_json?: Record<string, string>;
  validation_status: "valid" | "invalid";
  validation_issues: string[];
  warnings: string[];
  is_duplicate: boolean;
  is_opted_out: boolean;
  exclude_reason?: string | null;
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
  suppressedContacts: number;
  warnings: string[];
}

export interface CreateAudienceGroupInput {
  name: string;
  description?: string | null;
  organizationId?: string | null;
  sourceType?: AudienceSourceType | null;
  permissionStatus?: AudiencePermissionStatus;
  riskLevel?: AudienceRiskLevel;
  totalRows?: number;
  validCount?: number;
  invalidCount?: number;
  duplicateCount?: number;
  optOutCount?: number;
  suppressedCount?: number;
  linkedCrmCount?: number;
}

export interface ImportAudienceGroupInput {
  audienceGroupId: string;
  organizationId?: string | null;
  contacts: AudienceValidatedContact[];
}

export interface SaveAudiencePreviewSummary {
  audienceGroupId: string;
  audienceGroupName: string;
  totalAudienceContacts: number;
  validContacts: number;
  alreadyLinkedCrmContacts: number;
  matchedExistingContacts: number;
  matchedContactIdentities: number;
  existingContactsToLink: number;
  estimatedNewContactsToCreate: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  skippedOptedOut: number;
  skippedMissingPhone: number;
}

export interface SaveAudienceResult extends SaveAudiencePreviewSummary {
  crmCreatedCount: number;
  crmLinkedCount: number;
  crmSkippedCount: number;
  crmSaveStatus: AudienceCrmSaveStatus;
  group: AudienceGroup | null;
}

export type AudienceTemplateVariableKey =
  | "name"
  | "phone"
  | "salutation"
  | "gender"
  | "tag"
  | "location"
  | "product_interest"
  | "customer_type"
  | "notes";

export interface AudienceTemplateVariable {
  key: AudienceTemplateVariableKey;
  label: string;
  sampleValue: string;
  source: "mapped" | "derived";
}

export interface AudienceTemplateVariablesResponse {
  audienceGroupId: string;
  variables: AudienceTemplateVariable[];
  sampleValues: Partial<Record<AudienceTemplateVariableKey, string>>;
}

export const audienceSourceOptions: Array<{
  value: AudienceSourceType;
  label: string;
  riskLevel: AudienceRiskLevel;
}> = [
  { value: "existing_customers", label: "Existing customers", riskLevel: "medium" },
  { value: "form_or_register_leads", label: "Leads from form/register", riskLevel: "low" },
  { value: "event_booth_walkin", label: "Event / booth / walk-in", riskLevel: "medium" },
  { value: "previous_whatsapp_contact", label: "Previous WhatsApp conversation", riskLevel: "low" },
  { value: "referral_partner_list", label: "Referral / partner list", riskLevel: "medium" },
  { value: "cold_public_list", label: "Cold / public list", riskLevel: "high" },
  { value: "not_sure", label: "Not sure", riskLevel: "high" }
];
