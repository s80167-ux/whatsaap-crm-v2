import { apiGet, apiPatch, apiPost } from "../lib/http";
import type { HistoryRange } from "../lib/historyRange";
import type {
  AuditHistoryEntry,
  Contact,
  Conversation,
  Lead,
  Message,
  OutboundAttachmentInput,
  SalesOrder,
  SalesOrderDetail,
  SalesOrderHistoryEntry,
  SalesOrderItem,
  SalesSummary
} from "../types/api";

type ConversationApiRecord = Conversation;
type MessageApiRecord = Message;
type ContactApiRecord = Contact;

function buildHistoryRangeQuery(range?: HistoryRange) {
  if (!range) {
    return "";
  }

  const searchParams = new URLSearchParams({
    [range.unit]: String(range.value)
  });

  return `?${searchParams.toString()}`;
}

export async function fetchConversations(range?: HistoryRange) {
  const response = await apiGet<{ data: ConversationApiRecord[] }>(`/inbox/threads${buildHistoryRangeQuery(range)}`);
  return response.data;
}

export async function fetchMessages(conversationId: string, range?: HistoryRange) {
  const response = await apiGet<{ data: MessageApiRecord[] }>(
    `/inbox/threads/${conversationId}/messages${buildHistoryRangeQuery(range)}`
  );
  return response.data;
}

export async function fetchContacts(range?: HistoryRange) {
  const response = await apiGet<{ data: ContactApiRecord[] }>(`/contacts${buildHistoryRangeQuery(range)}`);
  return response.data;
}

export async function fetchContact(contactId: string) {
  const response = await apiGet<{ data: ContactApiRecord }>(`/contacts/${contactId}`);
  return response.data;
}

export async function fetchSalesOrders(filters?: {
  status?: "open" | "closed_won" | "closed_lost";
  createdFrom?: string;
  createdTo?: string;
  closedFrom?: string;
  closedTo?: string;
}) {
  const searchParams = new URLSearchParams();

  if (filters?.status) {
    searchParams.set("status", filters.status);
  }

  if (filters?.createdFrom) {
    searchParams.set("created_from", filters.createdFrom);
  }

  if (filters?.createdTo) {
    searchParams.set("created_to", filters.createdTo);
  }

  if (filters?.closedFrom) {
    searchParams.set("closed_from", filters.closedFrom);
  }

  if (filters?.closedTo) {
    searchParams.set("closed_to", filters.closedTo);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const response = await apiGet<{ data: SalesOrder[] }>(`/sales/orders${suffix}`);
  return response.data;
}

export async function fetchSalesSummary() {
  const response = await apiGet<{ data: SalesSummary }>("/sales/summary");
  return response.data;
}

export async function fetchSalesOrderDetail(orderId: string) {
  const response = await apiGet<{ data: SalesOrderDetail }>(`/sales/orders/${orderId}`);
  return response.data;
}

export async function fetchSalesOrderHistory(orderId: string) {
  const response = await apiGet<{ data: SalesOrderHistoryEntry[] }>(`/sales/orders/${orderId}/history`);
  return response.data;
}

export async function fetchLeads() {
  const response = await apiGet<{ data: Lead[] }>("/leads");
  return response.data;
}

export async function fetchLead(leadId: string) {
  const response = await apiGet<{ data: Lead }>(`/leads/${leadId}`);
  return response.data;
}

export async function fetchLeadHistory(leadId: string) {
  const response = await apiGet<{ data: AuditHistoryEntry[] }>(`/leads/${leadId}/history`);
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

export async function createSalesOrder(payload: {
  contactId: string;
  status: "open" | "closed_won" | "closed_lost";
  totalAmount: number;
  currency?: string;
  assignedUserId?: string | null;
  leadId?: string | null;
}) {
  return apiPost<{ data: SalesOrder }>("/sales/orders", payload);
}

export async function updateSalesOrder(payload: {
  orderId: string;
  assignedUserId?: string | null;
  status?: "open" | "closed_won" | "closed_lost";
  totalAmount?: number;
  currency?: string | null;
}) {
  return apiPatch<{ data: SalesOrder }>(`/sales/orders/${payload.orderId}`, {
    assignedUserId: payload.assignedUserId,
    status: payload.status,
    totalAmount: payload.totalAmount,
    currency: payload.currency ?? undefined
  });
}

export async function createSalesOrderItem(payload: {
  orderId: string;
  productType?: string | null;
  packageName?: string | null;
  unitPrice: number;
  quantity: number;
}) {
  return apiPost<{ data: SalesOrderItem }>(`/sales/orders/${payload.orderId}/items`, {
    productType: payload.productType ?? null,
    packageName: payload.packageName ?? null,
    unitPrice: payload.unitPrice,
    quantity: payload.quantity
  });
}

export async function createLead(payload: {
  contactId: string;
  source?: string | null;
  status: Lead["status"];
  temperature?: Lead["temperature"];
  assignedUserId?: string | null;
}) {
  return apiPost<{ data: Lead }>("/leads", payload);
}

export async function updateLead(payload: {
  leadId: string;
  source?: string | null;
  status?: Lead["status"];
  temperature?: Lead["temperature"];
  assignedUserId?: string | null;
}) {
  return apiPatch<{ data: Lead }>(`/leads/${payload.leadId}`, {
    source: payload.source,
    status: payload.status,
    temperature: payload.temperature,
    assignedUserId: payload.assignedUserId
  });
}

export async function convertLeadToOrder(payload: {
  leadId: string;
  status: "open" | "closed_won" | "closed_lost";
  totalAmount: number;
  currency?: string;
}) {
  return apiPost<{ data: { lead: Lead; order: SalesOrder } }>(`/leads/${payload.leadId}/convert`, {
    status: payload.status,
    totalAmount: payload.totalAmount,
    currency: payload.currency ?? "MYR"
  });
}
