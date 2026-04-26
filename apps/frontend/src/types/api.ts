export interface Conversation {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  whatsapp_account_label?: string | null;
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
  reply_to_message_id?: string | null;
  is_deleted?: boolean;
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
  primary_avatar_url?: string | null;
  owner_user_id?: string | null;
  whatsapp_source_count?: number;
  whatsapp_sources?: Array<{
    id: string;
    label: string | null;
  }>;
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
  source_message_id?: string | null;
  source_conversation_id?: string | null;
  premise_address?: string | null;
  business_type?: string | null;
  contact_person?: string | null;
  email_address?: string | null;
  expected_close_date?: string | null;
  coverage_status?: string | null;
  document_status?: string | null;
  notes?: string | null;
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

export interface QuickReplyTemplate {
  id: string;
  organization_id: string;
  title: string;
  body: string;
  category?: string | null;
  variable_definitions?: QuickReplyVariableDefinition[];
  is_active: boolean;
  sort_order: number;
  usage_count?: number;
  last_used_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuickReplyVariableDefinition {
  key: string;
  default_value?: string | null;
  required: boolean;
}

export interface QuickReplyAnalyticsTemplate {
  template_id: string;
  title: string;
  category?: string | null;
  usage_count: number;
  send_count: number;
  customer_replied_count: number;
  lead_created_count: number;
  order_created_count: number;
  order_closed_won_count: number;
  order_closed_lost_count: number;
  response_rate: number;
  lead_rate: number;
  win_rate: number;
  last_used_at?: string | null;
}

export interface QuickReplyAnalyticsSummary {
  total_templates: number;
  total_sends: number;
  customer_replied_count: number;
  lead_created_count: number;
  order_created_count: number;
  order_closed_won_count: number;
  order_closed_lost_count: number;
}

export interface QuickReplyAnalyticsResponse {
  summary: QuickReplyAnalyticsSummary;
  templates: QuickReplyAnalyticsTemplate[];
}
