export type UUID = string;

export interface ContactRecord {
  id: UUID;
  organization_id: UUID;
  display_name: string | null;
  phone_primary: string | null;
  phone_primary_normalized: string | null;
}

export interface ContactIdentityRecord {
  id: UUID;
  organization_id: UUID;
  contact_id: UUID;
  whatsapp_account_id: UUID | null;
  whatsapp_jid: string;
  phone_number: string | null;
  phone_number_normalized: string | null;
  raw_profile_name: string | null;
}

export interface ConversationRecord {
  id: UUID;
  organization_id: UUID;
  whatsapp_account_id: UUID;
  contact_id: UUID;
  last_message_id: UUID | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

export interface MessageRecord {
  id: UUID;
  organization_id: UUID;
  conversation_id: UUID;
  contact_id: UUID;
  whatsapp_account_id: UUID;
  contact_identity_id: UUID | null;
  external_message_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  content_text: string | null;
  raw_payload: unknown;
  sent_at: string;
}

export interface WhatsAppAccountRecord {
  id: UUID;
  organization_id: UUID;
  label: string | null;
  account_phone_e164: string | null;
  account_phone_normalized: string | null;
  connection_status: string;
  account_jid: string | null;
  display_name: string | null;
}

export interface InboundMessageInput {
  organizationId: UUID;
  whatsappAccountId: UUID;
  externalMessageId: string;
  remoteJid: string;
  phoneRaw: string | null;
  profileName: string | null;
  textBody: string | null;
  messageType: string;
  direction: "inbound" | "outbound";
  sentAt: Date;
  rawPayload: unknown;
}

export interface SendMessageInput {
  organizationId: UUID;
  whatsappAccountId: UUID;
  conversationId: UUID;
  text: string;
}
