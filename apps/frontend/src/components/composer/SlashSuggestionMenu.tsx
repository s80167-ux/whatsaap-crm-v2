import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { InsertMessageTemplate, InsertMessageVariable } from "./InsertMessageModal";

export type SlashSuggestionItem =
  | {
      id: string;
      kind: "template";
      title: string;
      subtitle: string;
      preview: string;
      template: InsertMessageTemplate;
    }
  | {
      id: string;
      kind: "variable";
      title: string;
      subtitle: string;
      preview: string;
      variable: InsertMessageVariable;
    };

type SlashSuggestionMenuProps = {
  open: boolean;
  items: SlashSuggestionItem[];
  selectedIndex: number;
  onSelect: (item: SlashSuggestionItem) => void;
  onSelectIndex: (index: number) => void;
  footerActionLabel?: string;
  onFooterAction?: () => void;
};

export function SlashSuggestionMenu({
  open,
  items,
  selectedIndex,
  onSelect,
  onSelectIndex,
  footerActionLabel,
  onFooterAction
}: SlashSuggestionMenuProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) {
      itemRefs.current = [];
      return;
    }

    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-[30rem] overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
      <div className="border-b border-border/80 bg-background-tint px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-soft">Slash suggestions</p>
      </div>
      {items.length > 0 ? (
        <div className="max-h-80 overflow-y-auto p-2">
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              data-slash-suggestion="true"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseEnter={() => onSelectIndex(index)}
              onClick={() => onSelect(item)}
              className={clsx(
                "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition",
                index === selectedIndex
                  ? "bg-primary/10 text-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-text">{item.title}</span>
                  <span className="rounded-full border border-border bg-background-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-soft">
                    {item.subtitle}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{item.preview}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs leading-5 text-text-muted">
          No templates or variables match that slash query.
        </div>
      )}
      {footerActionLabel && onFooterAction ? (
        <div className="border-t border-border/80 bg-background-tint/60 p-2">
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={onFooterAction}
            className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10"
          >
            {footerActionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}