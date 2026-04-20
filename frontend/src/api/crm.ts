import { apiGet, apiPost } from "../lib/http";
import type { Contact, Conversation, Message } from "../types/api";

export async function fetchConversations() {
  const response = await apiGet<{ data: Conversation[] }>("/conversations");
  return response.data;
}

export async function fetchMessages(conversationId: string) {
  const response = await apiGet<{ data: Message[] }>(`/messages/${conversationId}`);
  return response.data;
}

export async function fetchContacts() {
  const response = await apiGet<{ data: Contact[] }>("/contacts");
  return response.data;
}

export async function sendMessage(payload: {
  whatsappAccountId: string;
  conversationId: string;
  text: string;
}) {
  return apiPost<{ data: Message }>("/whatsapp/send", payload);
}
