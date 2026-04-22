import { useQuery } from "@tanstack/react-query";
import { fetchSalesOrderDetail, fetchSalesOrderHistory, fetchSalesOrders, fetchSalesSummary } from "../api/crm";

export function useSalesOrders(status?: "open" | "closed_won" | "closed_lost") {
  return useQuery({
    queryKey: ["sales-orders", status ?? "all"],
    queryFn: () => fetchSalesOrders(status)
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
