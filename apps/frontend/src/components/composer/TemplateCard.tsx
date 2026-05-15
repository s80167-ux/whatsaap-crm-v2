import clsx from "clsx";

type TemplateCardProps = {
  title: string;
  category: string;
  preview: string;
  active?: boolean;
  onClick: () => void;
};

export function TemplateCard({ title, category, preview, active = false, onClick }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Insert template: ${title}`}
      className={clsx(
        "rounded-2xl border px-4 py-3 text-left text-xs leading-5 transition",
        active
          ? "border-primary/30 bg-primary/10 text-foreground shadow-soft"
          : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span className="block font-semibold text-text">{title}</span>
      <span className="mt-1 inline-flex rounded-full border border-border bg-background-tint px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">
        {category}
      </span>
      <span className="mt-2 block">{preview}</span>
    </button>
  );
}