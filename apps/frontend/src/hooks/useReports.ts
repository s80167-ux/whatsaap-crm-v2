import { useQuery } from "@tanstack/react-query";
import { fetchDailyReport } from "../api/reports";

export function useDailyReport(input: {
  organizationId?: string | null;
  year: number;
  month: number;
  week?: string;
  day?: string;
  team?: string;
  salesRep?: string;
  productType?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      "daily-report",
      input.organizationId ?? null,
      input.year,
      input.month,
      input.week,
      input.day,
      input.team,
      input.salesRep,
      input.productType
    ],
    queryFn: () => fetchDailyReport(input),
    enabled: input.enabled ?? true
  });
}
