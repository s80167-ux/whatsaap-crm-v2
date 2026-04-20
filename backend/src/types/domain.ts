export type UUID = string;

export interface ContactRecord {
  id: UUID;
  organization_id: UUID;
  display_name: string | null;
  primary_phone_e164: string | null;
  primary_phone_normalized: string | null;
  primary_avatar_url?: string | null;
}

export interface ContactIdentityRecord {
  id: UUID;
  organization_id: UUID;
  contact_id: UUID;
  whatsapp_account_id: UUID | null;
  wa_jid: string;
  phone_e164: string | null;
  phone_normalized: string | null;
  profile_name: string | null;
  profile_push_name?: string | null;
}

export interface ConversationRecord {
  id: UUID;
  organization_id: UUID;
  whatsapp_account_id: UUID;
  contact_id: UUID;
  channel?: string;
  external_thread_key?: string | null;
  last_message_at: string | null;
  last_incoming_at?: string | null;
  last_outgoing_at?: string | null;
  unread_count: number;
}

export interface MessageRecord {
  id: UUID;
  organization_id: UUID;
  conversation_id: UUID;
  contact_id: UUID;
  whatsapp_account_id: UUID;
  external_message_id: string;
  external_chat_id?: string | null;
  direction: "incoming" | "outgoing" | "system";
  message_type: string;
  content_text: string | null;
  content_json: unknown;
  sent_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
  ack_status?: string;
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
  direction: "incoming" | "outgoing";
  sentAt: Date;
  rawPayload: unknown;
}

export interface SendMessageInput {
  organizationId: UUID;
  whatsappAccountId: UUID;
  conversationId: UUID;
  text: string;
}
