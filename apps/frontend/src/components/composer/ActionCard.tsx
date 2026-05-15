import clsx from "clsx";

type ActionCardProps = {
  title: string;
  description: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
};

export function ActionCard({ title, description, disabled = false, active = false, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={disabled ? `${title} coming soon` : title}
      disabled={disabled}
      className={clsx(
        "rounded-2xl border px-4 py-3 text-left text-xs leading-5 transition",
        disabled
          ? "cursor-not-allowed border-dashed border-border bg-background-tint text-text-soft opacity-80"
          : active
            ? "border-primary/30 bg-primary/10 text-foreground shadow-soft"
            : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span className="block font-semibold text-text">{title}</span>
      <span className="mt-1 block">{description}</span>
      {disabled ? (
        <span className="mt-2 inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">
          Soon
        </span>
      ) : null}
    </button>
  );
}