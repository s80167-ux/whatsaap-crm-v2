import clsx from "clsx";

type VariableChipProps = {
  label: string;
  value: string;
  active?: boolean;
  onClick: () => void;
};

export function VariableChip({ label, value, active = false, onClick }: VariableChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Insert ${label}`}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-left transition",
        active
          ? "border-primary/25 bg-primary/10 text-primary shadow-soft"
          : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground"
      )}
    >
      <span className="block text-xs font-semibold text-inherit">{label}</span>
      <span className="mt-0.5 block text-[11px] font-mono text-text-soft">{value}</span>
    </button>
  );
}