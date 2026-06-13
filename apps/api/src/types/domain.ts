import type { AuthUser } from "./auth.js";

export type UUID = string;

export interface ContactRecord {
  id: UUID;
  organization_id: UUID;
  status?: "active" | "merged" | string | null;
  merged_into_contact_id?: UUID | null;
  display_name: string | null;
  primary_phone_e164: string | null;
  primary_phone_normalized: string | null;
  email: string | null;
  company_name: string | null;
  notes: string | null;
  primary_avatar_url?: string | null;
  identity_status?: "resolved" | "provisional" | "needs_phone" | "needs_merge_review" | string | null;
  owner_user_id?: UUID | null;
  whatsapp_source_count?: number;
  whatsapp_sources?: Array<{
    id: UUID;
    label: string | null;
  }>;
}

export interface ContactIdentityRecord {
  id: UUID;
  organization_id: UUID;
  contact_id: UUID;
  whatsapp_account_id: UUID | null;
  social_channel_account_id?: UUID | null;
  external_profile_id?: string | null;
  wa_jid: string;
  phone_e164: string | null;
  phone_normalized: string | null;
  profile_name: string | null;
  profile_push_name?: string | null;
  profile_avatar_url?: string | null;
  identity_quality?: "strong" | "normal" | "weak" | "lid_only" | "phone_verified" | string | null;
  identity_score?: number | null;
}

export interface ConversationRecord {
  id: UUID;
  organization_id: UUID;
  whatsapp_account_id: UUID | null;
  social_channel_account_id?: UUID | null;
  contact_id: UUID;
  assigned_user_id?: UUID | null;
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
  whatsapp_account_id: UUID | null;
  social_channel_account_id?: UUID | null;
  channel?: string;
  external_message_id: string | null;
  external_chat_id?: string | null;
  reply_to_message_id?: UUID | null;
  media_id?: UUID | null;
  is_deleted?: boolean;
  direction: "incoming" | "outgoing" | "system";
  message_type: string;
  content_text: string | null;
  content_json: unknown;
  sent_at: string;
  created_at?: string;
  sort_at?: string;
  delivered_at?: string | null;
  read_at?: string | null;
  ack_status?: string;
  reply_preview_text?: string | null;
  has_sales?: boolean;
  sales_id?: UUID | null;
  sales_status?: string | null;
  sales_label?: string | null;
}

export interface WhatsAppAccountRecord {
  id: UUID;
  organization_id: UUID;
  created_by?: UUID | null;
  label: string | null;
  account_phone_e164: string | null;
  account_phone_normalized: string | null;
  connection_status: string;
  account_jid: string | null;
  display_name: string | null;
  history_sync_lookback_days?: number | null;
  reconnect_failure_count?: number | null;
  last_connection_error_code?: string | null;
  last_connection_error_message?: string | null;
  ban_suspected_at?: string | null;
  reconnect_suppressed_at?: string | null;
  last_connected_at?: string | null;
  last_disconnected_at?: string | null;
  health_score?: number | null;
  health_score_computed_at?: string | null;
  warmup_level?: number | null;
  warmup_started_at?: string | null;
  live_connection_status?: string | null;
  live_connected?: boolean | null;
  live_status_error?: string | null;
}

export interface InboundMessageInput {
  organizationId: UUID;
  whatsappAccountId: UUID;
  externalMessageId: string;
  remoteJid: string;
  phoneRaw: string | null;
  profileName: string | null;
  profilePushName?: string | null;
  profileAvatarUrl?: string | null;
  textBody: string | null;
  messageType: string;
  direction: "incoming" | "outgoing";
  sentAt: Date;
  rawPayload: unknown;
  mediaAttachment?: InboundMediaAttachmentInput | null;
}

export interface SendMessageInput {
  organizationId: UUID;
  whatsappAccountId: UUID;
  conversationId: UUID;
  authUser?: AuthUser | null;
  organizationUserId?: UUID | null;
  quickReplyTemplateId?: UUID | null;
  replyToMessageId?: UUID | null;
  forwardedFromMessageId?: UUID | null;
  text?: string | null;
  attachment?: OutboundMediaAttachmentInput | null;
  contactCard?: OutboundContactCardInput | null;
  outboxAvailableAt?: string | null;
  autoReplyContext?: {
    triggerType: "outside_hours" | "no_reply" | "first_message";
    inboundMessageId: UUID;
    skipIfOutgoingAfter: string;
  } | null;
  campaignContext?: {
    campaignId: UUID;
    campaignRecipientId: UUID;
  } | null;
}

export interface SendMessageOptions {
  waitForDispatch?: boolean;
}

export interface OutboundMediaAttachmentInput {
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  dataBase64?: string;
  mediaId?: UUID | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  mediaUrl?: string | null;
  legacyInline?: boolean;
}

export interface OutboundContactCardInput {
  displayName: string;
  vcard: string;
}

export interface InboundMediaAttachmentInput {
  kind: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  dataBase64: string;
  fileSizeBytes: number;
}
