import { pool } from "../config/database.js";
import { ReportRepository, type DailyMetricAggregateRow } from "../repositories/reportRepository.js";
import type { AuthUser } from "../types/auth.js";

type DailyMetric = "sales_count" | "sales_value" | "contacted" | "leads" | "won_count" | "won_value";

const DAILY_METRICS: Array<{
  id: DailyMetric;
  label: string;
  aggregate: "sales" | "contacted" | "leads" | "won";
  valueType: "count" | "currency";
}> = [
  { id: "sales_count", label: "Sales Count", aggregate: "sales", valueType: "count" },
  { id: "sales_value", label: "Sales Value", aggregate: "sales", valueType: "currency" },
  { id: "contacted", label: "Contacted", aggregate: "contacted", valueType: "count" },
  { id: "leads", label: "New Leads", aggregate: "leads", valueType: "count" },
  { id: "won_count", label: "Won Count", aggregate: "won", valueType: "count" },
  { id: "won_value", label: "Won Value", aggregate: "won", valueType: "currency" }
];

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeRoleLabel(value?: string | null) {
  if (!value || value === "all") {
    return null;
  }

  return value.toLowerCase().replace(/\s+/g, "_");
}

function buildDays(year: number, month: number, week?: string | null, specificDay?: string | null) {
  const monthIndex = month - 1;
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const allDays = Array.from({ length: totalDays }, (_, index) => new Date(year, monthIndex, index + 1));

  if (specificDay && specificDay !== "all") {
    return [parseDateKey(specificDay)];
  }

  if (!week || week === "all") {
    return allDays;
  }

  const weekNumber = Number(week);
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 5) {
    return allDays;
  }

  return allDays.filter((day) => Math.ceil(day.getDate() / 7) === weekNumber);
}

function aggregateMap(rows: DailyMetricAggregateRow[]) {
  const map = new Map<string, { count: number; amount: number }>();

  for (const row of rows) {
    if (!row.organization_user_id) {
      continue;
    }

    map.set(`${row.organization_user_id}:${row.report_date}`, {
      count: Number(row.count_value ?? 0),
      amount: Number(row.amount_value ?? 0)
    });
  }

  return map;
}

export class ReportService {
  constructor(private readonly reportRepository = new ReportRepository()) {}

  private getScope(authUser: AuthUser) {
    return {
      assignedOnly: authUser.permissionKeys.includes("sales.read_assigned"),
      organizationUserId: authUser.organizationUserId
    };
  }

  async getDailyReport(
    authUser: AuthUser,
    input: {
      organizationId: string | null;
      year: number;
      month: number;
      week?: string | null;
      specificDay?: string | null;
      team?: string | null;
      salesRepId?: string | null;
      productType?: string | null;
      timezone?: string | null;
    }
  ) {
    const timezone = input.timezone || "Asia/Kuala_Lumpur";
    const selectedDays = buildDays(input.year, input.month, input.week, input.specificDay);
    const startDate = formatDateKey(selectedDays[0] ?? new Date(input.year, input.month - 1, 1));
    const endDate = formatDateKey(addDays(selectedDays[selectedDays.length - 1] ?? parseDateKey(startDate), 1));
    const dayKeys = selectedDays.map(formatDateKey);
    const scope = this.getScope(authUser);
    const productType = input.productType && input.productType !== "all" ? input.productType : null;

    const client = await pool.connect();
    try {
      const users = await this.reportRepository.listActiveUsers(client, {
        organizationId: input.organizationId,
        ...scope,
        team: normalizeRoleLabel(input.team),
        salesRepId: input.salesRepId && input.salesRepId !== "all" ? input.salesRepId : null
      });
      const productTypes = await this.reportRepository.listProductTypes(client, {
        organizationId: input.organizationId,
        ...scope
      });
      const salesRows = await this.reportRepository.getSalesAggregates(client, {
        organizationId: input.organizationId,
        startDate,
        endDate,
        timezone,
        ...scope,
        productType
      });
      const wonRows = await this.reportRepository.getWonAggregates(client, {
        organizationId: input.organizationId,
        startDate,
        endDate,
        timezone,
        ...scope,
        productType
      });
      const leadRows = await this.reportRepository.getLeadAggregates(client, {
        organizationId: input.organizationId,
        startDate,
        endDate,
        timezone,
        ...scope
      });
      const contactedRows = await this.reportRepository.getContactedAggregates(client, {
        organizationId: input.organizationId,
        startDate,
        endDate,
        timezone,
        ...scope
      });

      const aggregateByMetric: Record<"sales" | "contacted" | "leads" | "won", Map<string, { count: number; amount: number }>> = {
        sales: aggregateMap(salesRows),
        contacted: aggregateMap(contactedRows),
        leads: aggregateMap(leadRows),
        won: aggregateMap(wonRows)
      };

      const rows = users.flatMap((user) =>
        DAILY_METRICS.map((metric) => {
          const values = dayKeys.map((dayKey) => {
            const aggregate = aggregateByMetric[metric.aggregate].get(`${user.id}:${dayKey}`);
            return metric.valueType === "currency" ? aggregate?.amount ?? 0 : aggregate?.count ?? 0;
          });
          return {
            userId: user.id,
            team: formatRole(user.role),
            name: user.full_name ?? user.email ?? "Team Member",
            metric: metric.id,
            metricLabel: metric.label,
            valueType: metric.valueType,
            values,
            total: values.reduce((sum, value) => sum + value, 0)
          };
        })
      );

      const salesValue = salesRows.reduce((sum, row) => sum + Number(row.amount_value ?? 0), 0);
      const wonValue = wonRows.reduce((sum, row) => sum + Number(row.amount_value ?? 0), 0);
      const salesCount = salesRows.reduce((sum, row) => sum + Number(row.count_value ?? 0), 0);
      const wonCount = wonRows.reduce((sum, row) => sum + Number(row.count_value ?? 0), 0);
      const newLeads = leadRows.reduce((sum, row) => sum + Number(row.count_value ?? 0), 0);
      const contacted = contactedRows.reduce((sum, row) => sum + Number(row.count_value ?? 0), 0);

      const teams = Array.from(new Set(users.map((user) => formatRole(user.role)))).sort();

      return {
        dateRange: {
          year: input.year,
          month: input.month,
          startDate,
          endDate,
          timezone,
          workingDays: selectedDays.filter((day) => day.getDay() !== 0 && day.getDay() !== 6).length,
          days: selectedDays.map((day) => ({
            key: formatDateKey(day),
            day: day.getDate(),
            weekday: day.toLocaleDateString("en-US", { weekday: "short" }),
            isWorkingDay: day.getDay() !== 0 && day.getDay() !== 6
          }))
        },
        filters: {
          teams,
          productTypes,
          salesReps: users.map((user) => ({
            id: user.id,
            name: user.full_name ?? user.email ?? "Team Member",
            team: formatRole(user.role)
          }))
        },
        summary: {
          salesValue,
          wonValue,
          salesCount,
          wonCount,
          newLeads,
          contacted
        },
        rows
      };
    } finally {
      client.release();
    }
  }
}
