import type { HistoryRange, HistoryRangeUnit } from "../lib/historyRange";
import { getRangeOptions } from "../lib/historyRange";
import { Select } from "./Input";

export function HistoryRangePicker({
  label,
  range,
  onChange
}: {
  label: string;
  range: HistoryRange;
  onChange: (range: HistoryRange) => void;
}) {
  const options = getRangeOptions(range.unit);

  function handleUnitChange(nextUnit: HistoryRangeUnit) {
    const nextOptions = getRangeOptions(nextUnit);
    const nextValue = nextOptions.some((option) => option === range.value) ? range.value : nextOptions[0];

    onChange({
      unit: nextUnit,
      value: nextValue
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[128px]">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">{label}</p>
        <Select value={range.unit} onChange={(event) => handleUnitChange(event.target.value as HistoryRangeUnit)} className="h-11">
          <option value="days">Days</option>
          <option value="months">Months</option>
        </Select>
      </div>
      <div className="min-w-[128px]">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-text-soft">Window</p>
        <Select
          value={String(range.value)}
          onChange={(event) =>
            onChange({
              unit: range.unit,
              value: Number(event.target.value)
            })
          }
          className="h-11"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option} {range.unit === "days" ? (option === 1 ? "day" : "days") : option === 1 ? "month" : "months"}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
