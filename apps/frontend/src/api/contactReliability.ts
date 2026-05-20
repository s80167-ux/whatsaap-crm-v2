import { apiGet, apiPost } from "../lib/http";

export type ConfidenceLevel = "verified" | "strong" | "partial" | "weak" | "broken";

export type ContactReliabilitySummary = {
  total_contacts: number;
  verified_count: number;
  strong_count: number;
  partial_count: number;
  weak_count: number;
  broken_count: number;
  unknown_name_count: number;
  missing_phone_count: number;
  duplicate_phone_count: number;
  identity_conflict_count: number;
  risky_contacts_count: number;
  auto_created_recent_count: number;
};

export type RiskyContact = {
  contact_id: string;
  display_name: string | null;
  primary_phone_e164: string | null;
  primary_phone_normalized: string | null;
  company_name: string | null;
  owner_user_id: string | null;
  last_message_at: string | null;
  created_at: string;
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  confidence_reasons: string[];
  risk_flags: string[];
  identity_count: number;
  conversation_count: number;
  duplicate_candidate_count: number;
};

export type UnknownContact = {
  contact_id: string;
  display_name: string | null;
  best_available_name: string | null;
  primary_phone_e164: string | null;
  whatsapp_jids: string[];
  profile_names: string[];
  push_names: string[];
  avatar_urls: string[];
  first_seen_at: string | null;
  last_seen_at: string | null;
  suggested_action: "update_name" | "attach_phone" | "merge_duplicate" | "ignore" | "needs_manual_review";
  confidence_score: number;
  risk_flags: string[];
};

export type DuplicateContactGroup = {
  group_key: string;
  reason: "same_phone" | "same_jid" | "similar_name_phone" | "identity_conflict" | string;
  normalized_phone: string | null;
  contacts: RiskyContact[];
  recommended_target_contact_id: string | null;
  confidence: string;
  warning_messages: string[];
};

export type ContactTimelineEvent = {
  event_type: string;
  occurred_at: string;
  source: string;
  details: Record<string, unknown>;
};

export type MergePreview = {
  source_contact: Record<string, unknown> | null;
  target_contact: Record<string, unknown> | null;
  fields_to_keep: Record<string, unknown>;
  fields_to_move: Record<string, unknown>;
  identities_to_move: number;
  conversations_to_move: number;
  messages_affected_count: number;
  leads_affected_count: number;
  sales_affected_count: number;
  warnings: string[];
  blocking_errors: string[];
};

function buildQuery(input?: {
  organizationId?: string | null;
  level?: ConfidenceLevel | null;
  flag?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (input?.organizationId) searchParams.set("organization_id", input.organizationId);
  if (input?.level) searchParams.set("level", input.level);
  if (input?.flag) searchParams.set("flag", input.flag);
  if (input?.search) searchParams.set("search", input.search);
  if (input?.limit) searchParams.set("limit", String(input.limit));
  if (input?.offset) searchParams.set("offset", String(input.offset));
  return searchParams.size > 0 ? `?${searchParams.toString()}` : "";
}

export async function getContactReliabilitySummary(input?: { organizationId?: string | null }) {
  const response = await apiGet<{ data: ContactReliabilitySummary }>(`/contact-reliability/summary${buildQuery(input)}`);
  return response.data;
}

export async function getRiskyContacts(input?: Parameters<typeof buildQuery>[0]) {
  const response = await apiGet<{ data: RiskyContact[] }>(`/contact-reliability/risky-contacts${buildQuery(input)}`);
  return response.data;
}

export async function getUnknownContacts(input?: Parameters<typeof buildQuery>[0]) {
  const response = await apiGet<{ data: UnknownContact[] }>(`/contact-reliability/unknown-contacts${buildQuery(input)}`);
  return response.data;
}

export async function getDuplicateContactGroups(input?: { organizationId?: string | null; limit?: number }) {
  const response = await apiGet<{ data: DuplicateContactGroup[] }>(`/contact-reliability/duplicates${buildQuery(input)}`);
  return response.data;
}

export async function getContactReliabilityTimeline(input: { contactId: string; organizationId?: string | null }) {
  const response = await apiGet<{ data: ContactTimelineEvent[] }>(
    `/contact-reliability/contacts/${input.contactId}/timeline${buildQuery({ organizationId: input.organizationId })}`
  );
  return response.data;
}

export async function applyContactSuggestion(input: {
  contactId: string;
  organizationId?: string | null;
  action: "update_name" | "update_phone" | "ignore_flag";
  displayName?: string | null;
  phoneNumber?: string | null;
  flag?: string | null;
  note?: string | null;
}) {
  const response = await apiPost<{ data: unknown }>(`/contact-reliability/contacts/${input.contactId}/apply-suggestion`, {
    organizationId: input.organizationId,
    organization_id: input.organizationId,
    action: input.action,
    displayName: input.displayName,
    phoneNumber: input.phoneNumber,
    flag: input.flag,
    note: input.note
  });
  return response.data;
}

export async function getMergePreview(input: {
  groupKey: string;
  organizationId?: string | null;
  sourceContactId: string;
  targetContactId: string;
}) {
  const response = await apiPost<{ data: MergePreview }>(
    `/contact-reliability/duplicates/${encodeURIComponent(input.groupKey)}/merge-preview`,
    {
      organizationId: input.organizationId,
      organization_id: input.organizationId,
      sourceContactId: input.sourceContactId,
      targetContactId: input.targetContactId
    }
  );
  return response.data;
}

export async function performReliabilityMerge(input: {
  organizationId?: string | null;
  sourceContactId: string;
  targetContactId: string;
  note?: string | null;
}) {
  const response = await apiPost<{ data: unknown }>("/contact-reliability/duplicates/merge", {
    organizationId: input.organizationId,
    organization_id: input.organizationId,
    sourceContactId: input.sourceContactId,
    targetContactId: input.targetContactId,
    note: input.note ?? null
  });
  return response.data;
}

export async function recalculateContactReliability(input?: { organizationId?: string | null }) {
  const response = await apiPost<{ data: unknown }>("/contact-reliability/recalculate", {
    organizationId: input?.organizationId,
    organization_id: input?.organizationId
  });
  return response.data;
}
