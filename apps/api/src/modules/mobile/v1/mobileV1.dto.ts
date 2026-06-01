import type { ContactRecord, MessageRecord } from "../../../types/domain.js";
import type { ConversationSummaryRow } from "../../../repositories/projectionRepository.js";
import type { LeadRow } from "../../../repositories/leadRepository.js";

type JsonObject = Record<string, unknown>;

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return stringOrNull(value) ?? fallback;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sourceLabels(contact: ContactRecord): string[] {
  return Array.isArray(contact.whatsapp_sources)
    ? contact.whatsapp_sources
        .map((source) => stringOrNull(source.label))
        .filter((label): label is string => Boolean(label))
    : [];
}

function displayStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function toMobileConversationDto(conversation: ConversationSummaryRow) {
  const contactName = stringOrFallback(conversation.contact_name, "Unknown");
  const hasSalesTag = conversation.has_sales_lead_tag === true || conversation.has_sales === true;

  return {
    id: conversation.id,
    contactId: stringOrNull(conversation.contact_id),
    contactName,
    lastMessagePreview: stringOrFallback(conversation.last_message_preview, "No messages yet"),
    unreadCount: numberOrZero(conversation.unread_count),
    whatsappAccountId: stringOrNull(conversation.whatsapp_account_id),
    whatsappAccountLabel: stringOrNull(conversation.whatsapp_account_label),
    lastMessageAt: stringOrNull(conversation.last_message_at),
    channel: stringOrNull(conversation.channel),
    avatarUrl: stringOrNull(conversation.contact_avatar_url),
    leadStatus: hasSalesTag ? "sales" : null,
    tag: hasSalesTag ? "Sales" : null
  };
}

export function toMobileMessageDto(message: MessageRecord) {
  return {
    id: message.id,
    direction: message.direction,
    messageType: stringOrFallback(message.message_type, "text"),
    contentText: stringOrFallback(message.content_text, ""),
    contentJson: (message.content_json ?? null) as JsonObject | null,
    sentAt: stringOrNull(message.sent_at),
    createdAt: stringOrNull(message.created_at),
    sortAt: stringOrNull(message.sort_at) ?? stringOrNull(message.sent_at),
    externalMessageId: stringOrNull(message.external_message_id),
    ackStatus: stringOrNull(message.ack_status)
  };
}

export function toMobileContactDto(contact: ContactRecord) {
  const displayName = stringOrNull(contact.display_name);
  const phone = stringOrNull(contact.primary_phone_e164) ?? stringOrNull(contact.primary_phone_normalized) ?? "";
  const companyName = stringOrNull(contact.company_name);
  const sourceCount = numberOrZero(contact.whatsapp_source_count);

  return {
    id: contact.id,
    name: displayName ?? (phone || "Unknown Contact"),
    phone,
    status: stringOrFallback(contact.status, "active"),
    tag: companyName ?? (sourceCount > 0 ? `${sourceCount} WhatsApp` : "CRM"),
    hasPhone: phone.length > 0,
    hasCompany: companyName !== null,
    hasWhatsAppSource: sourceCount > 0,
    email: stringOrNull(contact.email),
    companyName,
    notes: stringOrNull(contact.notes),
    sourceLabels: sourceLabels(contact),
    avatarUrl: stringOrNull(contact.primary_avatar_url),
    displayName
  };
}

export function toMobileLeadDto(lead: LeadRow) {
  const status = stringOrFallback(lead.status, "new_lead");
  const phone = stringOrNull(lead.primary_phone_normalized) ?? "";

  return {
    id: lead.id,
    contactId: lead.contact_id,
    status,
    displayStatus: displayStatus(status),
    name: stringOrFallback(lead.contact_name, "Unknown Contact"),
    phone,
    source: stringOrNull(lead.source),
    temperature: stringOrNull(lead.temperature),
    assignedUserId: stringOrNull(lead.assigned_user_id),
    createdAt: stringOrNull(lead.created_at),
    updatedAt: stringOrNull(lead.updated_at)
  };
}

export function toMobileQuickReplyDto(template: {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  is_active: boolean | null;
}) {
  return {
    id: template.id,
    title: stringOrFallback(template.title, "Quick reply"),
    body: stringOrFallback(template.body, ""),
    category: stringOrNull(template.category),
    isActive: template.is_active !== false
  };
}

export function toMobileMeDto(profile: {
  id: string;
  email: string | null;
  fullName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: profile.id,
    email: stringOrNull(profile.email),
    fullName: stringOrNull(profile.fullName),
    organizationId: stringOrNull(profile.organizationId),
    organizationName: stringOrNull(profile.organizationName),
    role: stringOrNull(profile.role),
    avatarUrl: stringOrNull(profile.avatarUrl)
  };
}
