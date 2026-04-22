export type HistoryRangeUnit = "days" | "months";

export interface HistoryRange {
  unit: HistoryRangeUnit;
  value: number;
}

export const DAY_RANGE_OPTIONS = [7, 14, 30, 60, 90] as const;
export const MONTH_RANGE_OPTIONS = [1, 3, 6, 12] as const;

export const DEFAULT_CHAT_HISTORY_RANGE: HistoryRange = {
  unit: "days",
  value: 30
};

export const DEFAULT_CONTACT_HISTORY_RANGE: HistoryRange = {
  unit: "months",
  value: 3
};

export function getRangeOptions(unit: HistoryRangeUnit) {
  return unit === "days" ? DAY_RANGE_OPTIONS : MONTH_RANGE_OPTIONS;
}

export function getHistoryRangeLabel(range: HistoryRange) {
  const suffix = range.unit === "days" ? (range.value === 1 ? "day" : "days") : range.value === 1 ? "month" : "months";
  return `Last ${range.value} ${suffix}`;
}

