export interface Conversation {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  contact_id: string;
  assigned_user_id?: string | null;
  channel?: string;
  external_thread_key?: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_type?: string | null;
  last_message_direction?: "incoming" | "outgoing" | "system" | null;
  last_incoming_at?: string | null;
  last_outgoing_at?: string | null;
  unread_count: number;
  contact_name: string;
  phone_number_normalized: string | null;
  contact_avatar_url?: string | null;
}

export interface Message {
  id: string;
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  whatsapp_account_id: string;
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

export interface Contact {
  id: string;
  organization_id: string;
  display_name: string | null;
  primary_phone_e164: string | null;
  primary_phone_normalized: string | null;
  owner_user_id?: string | null;
}
