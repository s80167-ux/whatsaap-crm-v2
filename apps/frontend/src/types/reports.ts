export type DailyReportMetric = "sales_count" | "sales_value" | "contacted" | "leads" | "won_count" | "won_value";

export interface DailyReportDay {
  key: string;
  day: number;
  weekday: string;
  isWorkingDay: boolean;
}

export interface DailyReportSalesRep {
  id: string;
  name: string;
  team: string;
}

export interface DailyReportRow {
  userId: string;
  team: string;
  name: string;
  metric: DailyReportMetric;
  metricLabel: string;
  valueType: "count" | "currency";
  values: number[];
  total: number;
}

export interface DailyReport {
  dateRange: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
    timezone: string;
    workingDays: number;
    days: DailyReportDay[];
  };
  filters: {
    teams: string[];
    productTypes: string[];
    salesReps: DailyReportSalesRep[];
  };
  summary: {
    salesValue: number;
    wonValue: number;
    salesCount: number;
    wonCount: number;
    newLeads: number;
    contacted: number;
  };
  rows: DailyReportRow[];
}
