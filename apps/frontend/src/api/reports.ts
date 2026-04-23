import { apiGet } from "../lib/http";
import type { DailyReport } from "../types/reports";

export async function fetchDailyReport(input: {
  organizationId?: string | null;
  year: number;
  month: number;
  week?: string;
  day?: string;
  team?: string;
  salesRep?: string;
  productType?: string;
}) {
  const searchParams = new URLSearchParams({
    year: String(input.year),
    month: String(input.month)
  });

  if (input.organizationId) {
    searchParams.set("organization_id", input.organizationId);
  }

  if (input.week && input.week !== "all") {
    searchParams.set("week", input.week);
  }

  if (input.day && input.day !== "all") {
    searchParams.set("day", input.day);
  }

  if (input.team && input.team !== "all") {
    searchParams.set("team", input.team);
  }

  if (input.salesRep && input.salesRep !== "all") {
    searchParams.set("sales_rep", input.salesRep);
  }

  if (input.productType && input.productType !== "all") {
    searchParams.set("product_type", input.productType);
  }

  const response = await apiGet<{ data: DailyReport }>(`/reports/daily?${searchParams.toString()}`);
  return response.data;
}
