export interface Conversation {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  contact_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact_name: string;
  phone_number_normalized: string | null;
}

export interface Message {
  id: string;
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  whatsapp_account_id: string;
  contact_identity_id: string | null;
  external_message_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  content_text: string | null;
  raw_payload: unknown;
  sent_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  display_name: string | null;
  primary_phone_e164: string | null;
  primary_phone_normalized: string | null;
}
