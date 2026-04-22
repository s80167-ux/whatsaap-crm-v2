import { useQuery } from "@tanstack/react-query";
import { fetchSalesOrderDetail, fetchSalesOrderHistory, fetchSalesOrders, fetchSalesSummary } from "../api/crm";

export function useSalesOrders(filters?: {
  status?: "open" | "closed_won" | "closed_lost";
  createdFrom?: string;
  createdTo?: string;
  closedFrom?: string;
  closedTo?: string;
}) {
  return useQuery({
    queryKey: [
      "sales-orders",
      filters?.status ?? "all",
      filters?.createdFrom ?? null,
      filters?.createdTo ?? null,
      filters?.closedFrom ?? null,
      filters?.closedTo ?? null
    ],
    queryFn: () => fetchSalesOrders(filters)
  });
}

export function useSalesSummary() {
  return useQuery({
    queryKey: ["sales-summary"],
    queryFn: fetchSalesSummary
  });
}

export function useSalesOrderDetail(orderId?: string) {
  return useQuery({
    queryKey: ["sales-order", orderId],
    queryFn: () => fetchSalesOrderDetail(orderId!),
    enabled: Boolean(orderId)
  });
}

export function useSalesOrderHistory(orderId?: string) {
  return useQuery({
    queryKey: ["sales-order-history", orderId],
    queryFn: () => fetchSalesOrderHistory(orderId!),
    enabled: Boolean(orderId)
  });
}
