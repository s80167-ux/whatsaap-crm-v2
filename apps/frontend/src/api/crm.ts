import { apiGet, apiPost } from "../lib/http";
import type { Contact, Conversation, Message, OutboundAttachmentInput } from "../types/api";

type ConversationApiRecord = Conversation;
type MessageApiRecord = Message;
type ContactApiRecord = Contact;

export async function fetchConversations() {
  const response = await apiGet<{ data: ConversationApiRecord[] }>("/inbox/threads");
  return response.data;
}

export async function fetchMessages(conversationId: string) {
  const response = await apiGet<{ data: MessageApiRecord[] }>(`/inbox/threads/${conversationId}/messages`);
  return response.data;
}

export async function fetchContacts() {
  const response = await apiGet<{ data: ContactApiRecord[] }>("/contacts");
  return response.data;
}

export async function fetchContact(contactId: string) {
  const response = await apiGet<{ data: ContactApiRecord }>(`/contacts/${contactId}`);
  return response.data;
}

export async function assignContact(payload: { contactId: string; organizationUserId: string }) {
  return apiPost<{ data: Contact }>(`/contacts/${payload.contactId}/assign`, {
    organizationUserId: payload.organizationUserId
  });
}

export async function assignConversation(payload: { conversationId: string; organizationUserId: string }) {
  return apiPost<{ data: { id: string; assigned_user_id: string | null } }>(
    `/conversations/${payload.conversationId}/assign`,
    { organizationUserId: payload.organizationUserId }
  );
}

export async function sendMessage(payload: {
  whatsappAccountId: string;
  conversationId: string;
  text?: string;
  attachment?: OutboundAttachmentInput | null;
}) {
  return apiPost<{ data: Message }>("/messages/send", payload);
}
