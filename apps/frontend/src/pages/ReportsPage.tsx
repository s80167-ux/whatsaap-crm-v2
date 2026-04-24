import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { BarChart3, CalendarDays, Download, Filter, LayoutGrid, Printer, RotateCcw, Table2 } from "lucide-react";
import { Card } from "../components/Card";
import { useDailyReport } from "../hooks/useReports";
import { getStoredUser } from "../lib/auth";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import type { DailyReportDay, DailyReportMetric, DailyReportRow, DailyReportSalesRep } from "../types/reports";

type ReportTab = "sales" | "pipeline" | "activity" | "sources" | "daily";

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "sales", label: "Sales" },
  { id: "pipeline", label: "Pipeline" },
  { id: "activity", label: "Activity" },
  { id: "sources", label: "Sources" },
  { id: "daily", label: "Daily Report" }
];

const METRIC_TONES: Record<DailyReportMetric, string> = {
  sales_count: "text-emerald-700",
  sales_value: "text-emerald-700",
  contacted: "text-primary",
  leads: "text-amber-700",
  won_count: "text-teal",
  won_value: "text-teal"
};

const DAILY_REPORT_METRIC_ORDER: DailyReportMetric[] = ["sales_count", "sales_value", "contacted", "leads", "won_count", "won_value"];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth();

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthRange(year: number, monthIndex: number) {
  const month = MONTHS[monthIndex];
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return `${month} ${year} (${month.slice(0, 3)} 1 - ${month.slice(0, 3)} ${lastDay})`;
}

function createCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell.replace(/"/g, '""');
          return /[",\n]/.test(value) ? `"${value}"` : value;
        })
        .join(",")
    )
    .join("\n");
}

function formatReportValue(value: number, valueType: "count" | "currency") {
  if (valueType === "currency") {
    return value > 0
      ? `RM ${value.toLocaleString("en-MY", {
          maximumFractionDigits: 1,
          notation: "compact"
        })}`
      : "-";
  }

  return value > 0 ? String(value) : "-";
}

function isWeekendDay(day: DailyReportDay) {
  const [year, month, date] = day.key.split("-").map(Number);
  const weekdayIndex = new Date(year, month - 1, date).getDay();
  return weekdayIndex === 0 || weekdayIndex === 6;
}

export function ReportsPage() {
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const dashboardContext = useOutletContext<DashboardOutletContext>();
  const selectedOrganizationId = dashboardContext.selectedOrganizationId;
  const [activeTab, setActiveTab] = useState<ReportTab>("daily");
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth));
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [specificDay, setSpecificDay] = useState("all");
  const [productType, setProductType] = useState("all");
  const [team, setTeam] = useState("all");
  const [salesRep, setSalesRep] = useState("all");
  const [metricFilter, setMetricFilter] = useState("all");

  const year = Number(selectedYear);
  const monthIndex = Number(selectedMonth);
  const { data: dailyReport, isLoading, error } = useDailyReport({
    organizationId: isSuperAdmin ? selectedOrganizationId : undefined,
    year,
    month: monthIndex + 1,
    week: selectedWeek,
    day: specificDay,
    team,
    salesRep,
    productType,
    enabled: true
  });

  const monthDayOptions = useMemo(() => {
    const totalDays = new Date(year, monthIndex + 1, 0).getDate();
    return Array.from({ length: totalDays }, (_, index) => new Date(year, monthIndex, index + 1));
  }, [monthIndex, year]);

  const reportDays = dailyReport?.dateRange.days ?? [];
  const dailyRows = dailyReport?.rows ?? [];
  const filteredDailyRows = useMemo(
    () => (metricFilter === "all" ? dailyRows : dailyRows.filter((row) => row.metric === metricFilter)),
    [dailyRows, metricFilter]
  );
  const metricOptions = useMemo(() => {
    const labels = new Map<DailyReportMetric, string>();
    dailyRows.forEach((row) => labels.set(row.metric, row.metricLabel));

    return DAILY_REPORT_METRIC_ORDER.filter((metric) => labels.has(metric)).map((metric) => ({
      value: metric,
      label: labels.get(metric) ?? metric
    }));
  }, [dailyRows]);
  const availableTeams = dailyReport?.filters.teams ?? [];
  const productTypes = dailyReport?.filters.productTypes ?? [];
  const salesReps = dailyReport?.filters.salesReps ?? [];
  const workingDays = dailyReport?.dateRange.workingDays ?? 0;
  const totalSales = dailyReport?.summary.salesValue ?? 0;
  const totalLeads = dailyReport?.summary.newLeads ?? 0;

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }

    setProductType("all");
    setTeam("all");
    setSalesRep("all");
    setMetricFilter("all");
  }, [isSuperAdmin, selectedOrganizationId]);

  function resetDateFilters() {
    setSelectedYear(String(currentYear));
    setSelectedMonth(String(currentMonth));
    setSelectedWeek("all");
    setSpecificDay("all");
  }

  function resetTeamFilters() {
    setProductType("all");
    setTeam("all");
    setSalesRep("all");
    setMetricFilter("all");
  }

  function exportDailyReport() {
    const headers = ["No.", "Team", "Name", "Metric", ...reportDays.map((day) => String(day.day).padStart(2, "0")), "Total"];
    const rows = filteredDailyRows.map((row, index) => [
      String(index + 1),
      row.team,
      row.name,
      row.metricLabel,
      ...row.values.map((value) => formatReportValue(value, row.valueType)),
      formatReportValue(row.total, row.valueType)
    ]);
    const csv = createCsv([["Daily Sales & Contact Report"], [`Date Range: ${formatMonthRange(year, monthIndex)}`], [], headers, ...rows]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `daily-report-${year}-${String(monthIndex + 1).padStart(2, "0")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-soft p-2 text-primary">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="section-title">Analytics &amp; Reports</h1>
              <p className="section-copy mt-1">Comprehensive insights into sales performance and pipeline health.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <ReportStat label="Sales Value" value={`RM ${totalSales.toLocaleString("en-MY")}`} />
          <ReportStat label="New Leads" value={String(totalLeads)} />
          <ReportStat label="Working Days" value={String(workingDays)} />
        </div>
      </section>

      <div className="grid gap-2 rounded-lg bg-white/70 p-1 shadow-soft md:grid-cols-5">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition ${
              activeTab === tab.id ? "bg-white text-primary shadow-soft" : "text-text-muted hover:bg-white/70 hover:text-text"
            }`}
          >
            {tab.id === "daily" ? <Table2 size={16} /> : <LayoutGrid size={16} />}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "daily" ? (
        <DailyReportDashboard
          availableTeams={availableTeams}
          dayOptions={monthDayOptions}
          dailyRows={filteredDailyRows}
          errorMessage={error instanceof Error ? error.message : null}
          isAwaitingOrganization={false}
          isLoading={isLoading}
          metricFilter={metricFilter}
          metricOptions={metricOptions}
          productType={productType}
          productTypes={productTypes}
          reportDays={reportDays}
          salesRep={salesRep}
          salesReps={salesReps}
          selectedMonth={selectedMonth}
          selectedWeek={selectedWeek}
          selectedYear={selectedYear}
          specificDay={specificDay}
          team={team}
          workingDays={workingDays}
          onExport={exportDailyReport}
          onPrint={() => window.print()}
          onMetricFilterChange={setMetricFilter}
          onProductTypeChange={setProductType}
          onResetDates={resetDateFilters}
          onResetTeamFilters={resetTeamFilters}
          onSalesRepChange={setSalesRep}
          onSpecificDayChange={setSpecificDay}
          onTeamChange={setTeam}
          onWeekChange={setSelectedWeek}
          onMonthChange={(value) => {
            setSelectedMonth(value);
            setSpecificDay("all");
          }}
          onYearChange={(value) => {
            setSelectedYear(value);
            setSpecificDay("all");
          }}
        />
      ) : (
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{REPORT_TABS.find((tab) => tab.id === activeTab)?.label}</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Report module placeholder</h2>
          <p className="section-copy mt-2">
            This tab is ready for the next report item. Daily Report is available now with backend-powered export and print actions.
          </p>
        </Card>
      )}
    </div>
  );
}

function DailyReportDashboard(props: {
  availableTeams: string[];
  dayOptions: Date[];
  dailyRows: DailyReportRow[];
  errorMessage: string | null;
  isAwaitingOrganization: boolean;
  isLoading: boolean;
  metricFilter: string;
  metricOptions: Array<{ value: DailyReportMetric; label: string }>;
  productType: string;
  productTypes: string[];
  reportDays: DailyReportDay[];
  salesRep: string;
  salesReps: DailyReportSalesRep[];
  selectedMonth: string;
  selectedWeek: string;
  selectedYear: string;
  specificDay: string;
  team: string;
  workingDays: number;
  onExport: () => void;
  onMonthChange: (value: string) => void;
  onPrint: () => void;
  onMetricFilterChange: (value: string) => void;
  onProductTypeChange: (value: string) => void;
  onResetDates: () => void;
  onResetTeamFilters: () => void;
  onSalesRepChange: (value: string) => void;
  onSpecificDayChange: (value: string) => void;
  onTeamChange: (value: string) => void;
  onWeekChange: (value: string) => void;
  onYearChange: (value: string) => void;
}) {
  const compactActionClassName =
    "inline-flex items-center gap-1.5 px-1 py-1 text-xs font-semibold text-text-muted transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card className="report-no-print !px-5 !py-4 !shadow-none hover:!translate-y-0 hover:!shadow-soft">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <CalendarDays size={16} />
            Date Range: {formatMonthRange(Number(props.selectedYear), Number(props.selectedMonth))}
          </div>
          <button
            type="button"
            onClick={props.onResetDates}
            className={compactActionClassName}
          >
            <RotateCcw size={13} />
            Reset Dates
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <ReportSelect label="Year" value={props.selectedYear} onChange={props.onYearChange}>
            {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </ReportSelect>
          <ReportSelect label="Month" value={props.selectedMonth} onChange={props.onMonthChange}>
            {MONTHS.map((month, index) => (
              <option key={month} value={index}>
                {month}
              </option>
            ))}
          </ReportSelect>
          <ReportSelect label="Week (ISO)" value={props.selectedWeek} onChange={props.onWeekChange}>
            <option value="all">All Weeks</option>
            {[1, 2, 3, 4, 5].map((week) => (
              <option key={week} value={week}>
                Week {week}
              </option>
            ))}
          </ReportSelect>
          <ReportSelect label="Specific Day" value={props.specificDay} onChange={props.onSpecificDayChange}>
            <option value="all">All Days</option>
            {props.dayOptions.map((day) => (
              <option key={formatDateKey(day)} value={formatDateKey(day)}>
                {day.toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}
              </option>
            ))}
          </ReportSelect>
        </div>
      </Card>

      <Card className="report-no-print !px-5 !py-4 !shadow-none hover:!translate-y-0 hover:!shadow-soft">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <Filter size={16} className="text-primary" />
          Team &amp; Product Filters
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <ReportSelect label="Product Type" value={props.productType} onChange={props.onProductTypeChange}>
            <option value="all">All Products</option>
            {props.productTypes.map((productType) => (
              <option key={productType} value={productType}>
                {productType}
              </option>
            ))}
          </ReportSelect>
          <ReportSelect label="Team" value={props.team} onChange={props.onTeamChange}>
            <option value="all">All Teams</option>
            {props.availableTeams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </ReportSelect>
          <ReportSelect label="Sales Rep" value={props.salesRep} onChange={props.onSalesRepChange}>
            <option value="all">All Members</option>
            {props.salesReps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </ReportSelect>
          <ReportSelect label="Metric" value={props.metricFilter} onChange={props.onMetricFilterChange}>
            <option value="all">All Metrics</option>
            {props.metricOptions.map((metric) => (
              <option key={metric.value} value={metric.value}>
                {metric.label}
              </option>
            ))}
          </ReportSelect>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={props.onResetTeamFilters} className={compactActionClassName}>
            <RotateCcw size={13} />
            Reset Team Filters
          </button>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={props.onPrint}
              disabled={props.isLoading || props.dailyRows.length === 0}
              className={compactActionClassName}
            >
              <Printer size={14} />
              Print
            </button>
            <button
              type="button"
              onClick={props.onExport}
              disabled={props.isLoading || props.dailyRows.length === 0}
              className={compactActionClassName}
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>
      </Card>

      <Card className="report-print-area overflow-hidden p-0">
        <div className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.08em]">Daily Sales &amp; Contact Report</h2>
            <p className="mt-1 text-xs font-semibold text-slate-300">
              {MONTHS[Number(props.selectedMonth)]} {props.selectedYear}
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-200">Working Days: {props.workingDays}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="bg-slate-800 text-[11px] uppercase tracking-[0.04em] text-white">
                <th className="w-8 px-2 py-2">No.</th>
                <th className="w-24 px-2 py-2">Team</th>
                <th className="w-32 px-2 py-2">Name</th>
                <th className="w-24 px-2 py-2">Metric</th>
                {props.reportDays.map((day) => {
                  const isWeekend = isWeekendDay(day);
                  const isHovered = hoveredDayKey === day.key;

                  return (
                    <th
                      key={day.key}
                      className={`px-1.5 py-2 text-center transition-colors ${
                        isHovered
                          ? "bg-[rgba(96,165,250,0.28)] text-white"
                          : isWeekend
                            ? "bg-[rgba(96,165,250,0.18)] text-white"
                            : ""
                      }`}
                      onMouseEnter={() => setHoveredDayKey(day.key)}
                      onMouseLeave={() => setHoveredDayKey((current) => (current === day.key ? null : current))}
                    >
                      <span className="block text-[11px]">{String(day.day).padStart(2, "0")}</span>
                      <span className={`block text-[9px] normal-case ${isHovered || isWeekend ? "text-blue-100" : "text-slate-300"}`}>
                        {day.weekday}
                      </span>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {props.errorMessage ? (
                <tr>
                  <td colSpan={props.reportDays.length + 5} className="px-5 py-8 text-center text-coral">
                    {props.errorMessage}
                  </td>
                </tr>
              ) : props.isLoading ? (
                <tr>
                  <td colSpan={props.reportDays.length + 5} className="px-5 py-8 text-center text-text-muted">
                    Loading report data...
                  </td>
                </tr>
              ) : props.dailyRows.length > 0 ? (
                props.dailyRows.map((row, index) => (
                  <tr key={`${row.userId}-${row.metric}`} className="border-t border-border hover:bg-background-tint">
                    <td className="px-2 py-2 text-text-muted">{index + 1}</td>
                    <td className="px-2 py-2 font-medium text-text">{row.team}</td>
                    <td className="max-w-32 truncate px-2 py-2 font-semibold text-text" title={row.name}>{row.name}</td>
                    <td className={`px-2 py-2 text-[10px] font-bold uppercase tracking-[0.06em] ${METRIC_TONES[row.metric]}`}>
                      {row.metricLabel}
                    </td>
                    {row.values.map((value, valueIndex) => {
                      const day = props.reportDays[valueIndex];
                      const isWeekend = day ? isWeekendDay(day) : false;
                      const isHovered = day ? hoveredDayKey === day.key : false;

                      return (
                        <td
                          key={`${row.userId}-${row.metric}-${valueIndex}`}
                          className={`px-1.5 py-2 text-center transition-colors ${
                            isHovered
                              ? "bg-[rgba(96,165,250,0.18)] text-text"
                              : isWeekend
                                ? "bg-[rgba(96,165,250,0.1)] text-text"
                                : "text-text-muted"
                          }`}
                          onMouseEnter={() => day && setHoveredDayKey(day.key)}
                          onMouseLeave={() => day && setHoveredDayKey((current) => (current === day.key ? null : current))}
                        >
                          {formatReportValue(value, row.valueType)}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center font-bold text-text">{formatReportValue(row.total, row.valueType)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={props.reportDays.length + 5} className="px-5 py-8 text-center text-text-muted">
                    No team members found for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-soft">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-soft">{label}</p>
      <p className="mt-1 text-lg font-bold text-text">{value}</p>
    </div>
  );
}

function ReportSelect({
  children,
  label,
  value,
  onChange
}: {
  children: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">{label}</span>
      <select
        className="input-base mt-1.5 h-9 !border-0 !bg-slate-50 !px-3 !py-1.5 text-sm !shadow-none ring-1 ring-slate-200 focus:!ring-primary/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
