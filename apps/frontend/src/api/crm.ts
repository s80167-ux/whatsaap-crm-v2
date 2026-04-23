import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/http";
import type { HistoryRange } from "../lib/historyRange";
import type {
  AuditHistoryEntry,
  Contact,
  Conversation,
  Lead,
  Message,
  OutboundAttachmentInput,
  QuickReplyTemplate,
  SalesOrder,
  SalesOrderDetail,
  SalesOrderHistoryEntry,
  SalesOrderItem,
  SalesSummary
} from "../types/api";

type ConversationApiRecord = Conversation;
type MessageApiRecord = Message;
type ContactApiRecord = Contact;

function buildHistoryRangeQuery(range?: HistoryRange, organizationId?: string | null) {
  const searchParams = new URLSearchParams();

  if (range) {
    searchParams.set(range.unit, String(range.value));
  }

  if (organizationId) {
    searchParams.set("organization_id", organizationId);
  }

  return searchParams.size > 0 ? `?${searchParams.toString()}` : "";
}

export async function fetchConversations(range?: HistoryRange, organizationId?: string | null) {
  const response = await apiGet<{ data: ConversationApiRecord[] }>(`/inbox/threads${buildHistoryRangeQuery(range, organizationId)}`);
  return response.data;
}

export async function fetchMessages(conversationId: string, range?: HistoryRange, organizationId?: string | null) {
  const response = await apiGet<{ data: MessageApiRecord[] }>(
    `/inbox/threads/${conversationId}/messages${buildHistoryRangeQuery(range, organizationId)}`
  );
  return response.data;
}

export async function fetchContacts(range?: HistoryRange, organizationId?: string | null) {
  const response = await apiGet<{ data: ContactApiRecord[] }>(`/contacts${buildHistoryRangeQuery(range, organizationId)}`);
  return response.data;
}

export async function fetchContact(contactId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: ContactApiRecord }>(`/contacts/${contactId}${suffix}`);
  return response.data;
}

export async function fetchSalesOrders(filters?: {
  status?: "open" | "closed_won" | "closed_lost";
  createdFrom?: string;
  createdTo?: string;
  closedFrom?: string;
  closedTo?: string;
  organizationId?: string | null;
}) {
  const searchParams = new URLSearchParams();

  if (filters?.organizationId) {
    searchParams.set("organization_id", filters.organizationId);
  }

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

export async function fetchSalesSummary(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: SalesSummary }>(`/sales/summary${suffix}`);
  return response.data;
}

export async function fetchSalesOrderDetail(orderId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: SalesOrderDetail }>(`/sales/orders/${orderId}${suffix}`);
  return response.data;
}

export async function fetchSalesOrderHistory(orderId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: SalesOrderHistoryEntry[] }>(`/sales/orders/${orderId}/history${suffix}`);
  return response.data;
}

export async function fetchLeads(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: Lead[] }>(`/leads${suffix}`);
  return response.data;
}

export async function fetchLead(leadId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: Lead }>(`/leads/${leadId}${suffix}`);
  return response.data;
}

export async function fetchLeadHistory(leadId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: AuditHistoryEntry[] }>(`/leads/${leadId}/history${suffix}`);
  return response.data;
}

export async function fetchQuickReplies(input?: { organizationId?: string | null; includeInactive?: boolean }) {
  const searchParams = new URLSearchParams();

  if (input?.organizationId) {
    searchParams.set("organization_id", input.organizationId);
  }

  if (input?.includeInactive) {
    searchParams.set("include_inactive", "true");
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const response = await apiGet<{ data: QuickReplyTemplate[] }>(`/quick-replies${suffix}`);
  return response.data;
}

export async function createQuickReply(payload: {
  organizationId?: string | null;
  title: string;
  body: string;
  category?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const response = await apiPost<{ data: QuickReplyTemplate }>("/quick-replies", payload);
  return response.data;
}

export async function updateQuickReply(payload: {
  templateId: string;
  organizationId?: string | null;
  title?: string;
  body?: string;
  category?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const response = await apiPatch<{ data: QuickReplyTemplate }>(`/quick-replies/${payload.templateId}`, {
    organizationId: payload.organizationId,
    title: payload.title,
    body: payload.body,
    category: payload.category,
    isActive: payload.isActive,
    sortOrder: payload.sortOrder
  });
  return response.data;
}

export async function deleteQuickReply(payload: { templateId: string; organizationId?: string | null }) {
  const suffix = payload.organizationId ? `?organization_id=${encodeURIComponent(payload.organizationId)}` : "";
  return apiDelete<{ ok: true }>(`/quick-replies/${payload.templateId}${suffix}`);
}

export async function recordQuickReplyUsage(payload: {
  templateId: string;
  organizationId?: string | null;
  conversationId?: string | null;
}) {
  const response = await apiPost<{ data: QuickReplyTemplate }>(`/quick-replies/${payload.templateId}/usage`, {
    organizationId: payload.organizationId,
    conversationId: payload.conversationId
  });
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

export async function recordSalesShareLinkAudit(payload: {
  entityType: "sales_order" | "sales_order_item" | "lead" | "sales_metric" | "sales_pipeline" | "sales_trend" | "sales_timeline";
  entityId?: string | null;
  orderId?: string | null;
  leadId?: string | null;
  section: "order-detail" | "lead-detail" | "timeline";
  source:
    | "sales_order_row"
    | "sales_lead_row"
    | "sales_order_detail"
    | "sales_lead_detail"
    | "sales_timeline_panel"
    | "sales_timeline_entry"
    | "dashboard_metric_card"
    | "dashboard_pipeline_card"
    | "dashboard_trend_bucket";
  href: string;
}) {
  return apiPost<{ data: { recorded: boolean } }>("/sales/share-links/audit", payload);
}
