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

export interface OutboundAttachmentInput {
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  dataBase64: string;
  fileSizeBytes: number;
}

export interface Contact {
  id: string;
  organization_id: string;
  display_name: string | null;
  primary_phone_e164: string | null;
  primary_phone_normalized: string | null;
  owner_user_id?: string | null;
}

export interface SalesOrder {
  id: string;
  organization_id: string;
  contact_id: string;
  lead_id?: string | null;
  assigned_user_id?: string | null;
  status: "open" | "closed_won" | "closed_lost";
  total_amount: string;
  currency: string;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
  contact_name?: string | null;
  primary_phone_normalized?: string | null;
  lead_status?: string | null;
}

export interface SalesSummary {
  total_orders: number;
  open_orders: number;
  won_orders: number;
  lost_orders: number;
  open_value: string;
  won_value: string;
}

export interface SalesOrderItem {
  id: string;
  sales_order_id: string;
  product_type?: string | null;
  package_name?: string | null;
  unit_price: string;
  quantity: number;
  total_price: string;
  created_at: string;
}

export interface SalesOrderDetail {
  order: SalesOrder;
  items: SalesOrderItem[];
}

export interface SalesOrderHistoryEntry {
  id: string;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

export interface AuditHistoryEntry {
  id: string;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

export interface Lead {
  id: string;
  organization_id: string;
  contact_id: string;
  source?: string | null;
  status: "new_lead" | "contacted" | "interested" | "processing" | "closed_won" | "closed_lost";
  temperature?: "cold" | "warm" | "hot" | null;
  assigned_user_id?: string | null;
  created_at: string;
  updated_at: string;
  contact_name?: string | null;
  primary_phone_normalized?: string | null;
}
