import { useQuery } from "@tanstack/react-query";
import { fetchSalesOrderDetail, fetchSalesOrderHistory, fetchSalesOrders, fetchSalesSummary } from "../api/crm";

function getOrganizationQueryKey(organizationId?: string | null) {
  return organizationId === null ? "all" : organizationId ?? "current";
}

export function useSalesOrders(filters?: {
  status?: "open" | "closed_won" | "closed_lost";
  createdFrom?: string;
  createdTo?: string;
  closedFrom?: string;
  closedTo?: string;
  organizationId?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      "sales-orders",
      getOrganizationQueryKey(filters?.organizationId),
      filters?.status ?? "all",
      filters?.createdFrom ?? null,
      filters?.createdTo ?? null,
      filters?.closedFrom ?? null,
      filters?.closedTo ?? null
    ],
    queryFn: () => fetchSalesOrders(filters),
    enabled: filters?.enabled ?? true
  });
}

export function useSalesSummary(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sales-summary", getOrganizationQueryKey(organizationId)],
    queryFn: () => fetchSalesSummary(organizationId),
    enabled
  });
}

export function useSalesOrderDetail(orderId?: string, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sales-order", orderId, getOrganizationQueryKey(organizationId)],
    queryFn: () => fetchSalesOrderDetail(orderId!, organizationId),
    enabled: Boolean(orderId) && enabled
  });
}

export function useSalesOrderHistory(orderId?: string, organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sales-order-history", orderId, getOrganizationQueryKey(organizationId)],
    queryFn: () => fetchSalesOrderHistory(orderId!, organizationId),
    enabled: Boolean(orderId) && enabled
  });
}
