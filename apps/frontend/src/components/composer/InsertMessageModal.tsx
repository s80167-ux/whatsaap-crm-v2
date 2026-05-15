import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Button } from "../Button";
import { Input } from "../Input";
import { PopupOverlay } from "../PopupOverlay";
import { ActionCard } from "./ActionCard";
import { TemplateCard } from "./TemplateCard";
import { VariableChip } from "./VariableChip";

export type InsertMessageVariable = {
  id: string;
  label: string;
  value: string;
  keywords?: string[];
};

export type InsertMessageTemplate = {
  id: string;
  title: string;
  category: string;
  content: string;
  preview?: string;
  keywords?: string[];
};

export type InsertMessageAiAction = {
  id: string;
  title: string;
  description: string;
  disabled?: boolean;
  keywords?: string[];
};

type InsertMessageTab = "all" | "templates" | "variables" | "ai";

type InsertMessageModalProps = {
  open: boolean;
  onClose: () => void;
  variables: InsertMessageVariable[];
  templates: InsertMessageTemplate[];
  aiActions: InsertMessageAiAction[];
  loadingTemplates?: boolean;
  templateEmptyMessage?: string;
  templateEmptyActionLabel?: string;
  onSelectVariable: (item: InsertMessageVariable) => void;
  onSelectTemplate: (item: InsertMessageTemplate) => void;
  onTemplateEmptyAction?: () => void;
  onSelectAiAction?: (item: InsertMessageAiAction) => void;
};

type HighlightItem =
  | { id: string; kind: "variable"; data: InsertMessageVariable }
  | { id: string; kind: "template"; data: InsertMessageTemplate }
  | { id: string; kind: "ai"; data: InsertMessageAiAction };

const TABS: Array<{ id: InsertMessageTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "templates", label: "Templates" },
  { id: "variables", label: "Variables" },
  { id: "ai", label: "AI Actions" }
];

export function InsertMessageModal({
  open,
  onClose,
  variables,
  templates,
  aiActions,
  loadingTemplates = false,
  templateEmptyMessage,
  templateEmptyActionLabel,
  onSelectVariable,
  onSelectTemplate,
  onTemplateEmptyAction,
  onSelectAiAction
}: InsertMessageModalProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<InsertMessageTab>("all");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const itemRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const normalizedSearch = search.trim().toLowerCase();

  const filteredVariables = useMemo(
    () =>
      variables.filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        const haystack = [item.label, item.value, ...(item.keywords ?? [])].join(" ").toLowerCase();
        return haystack.includes(normalizedSearch);
      }),
    [normalizedSearch, variables]
  );

  const filteredTemplates = useMemo(
    () =>
      templates.filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        const haystack = [item.title, item.category, item.content, ...(item.keywords ?? [])].join(" ").toLowerCase();
        return haystack.includes(normalizedSearch);
      }),
    [normalizedSearch, templates]
  );

  const filteredAiActions = useMemo(
    () =>
      aiActions.filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        const haystack = [item.title, item.description, ...(item.keywords ?? [])].join(" ").toLowerCase();
        return haystack.includes(normalizedSearch);
      }),
    [aiActions, normalizedSearch]
  );

  const highlightItems = useMemo<HighlightItem[]>(() => {
    const items: HighlightItem[] = [];

    if (activeTab === "all" || activeTab === "variables") {
      items.push(...filteredVariables.map((item) => ({ id: `variable:${item.id}`, kind: "variable" as const, data: item })));
    }

    if (activeTab === "all" || activeTab === "templates") {
      items.push(...filteredTemplates.map((item) => ({ id: `template:${item.id}`, kind: "template" as const, data: item })));
    }

    if (activeTab === "all" || activeTab === "ai") {
      items.push(...filteredAiActions.map((item) => ({ id: `ai:${item.id}`, kind: "ai" as const, data: item })));
    }

    return items;
  }, [activeTab, filteredAiActions, filteredTemplates, filteredVariables]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setActiveTab("all");
      setHighlightedIndex(0);
      itemRefs.current = {};
      return;
    }

    if (highlightItems.length === 0) {
      setHighlightedIndex(0);
      return;
    }

    setHighlightedIndex((current) => Math.min(current, highlightItems.length - 1));
  }, [highlightItems.length, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      if (event.key === "ArrowDown") {
        if (highlightItems.length === 0) {
          return;
        }

        event.preventDefault();
        setHighlightedIndex((current) => (current + 1) % highlightItems.length);
        return;
      }

      if (event.key === "ArrowUp") {
        if (highlightItems.length === 0) {
          return;
        }

        event.preventDefault();
        setHighlightedIndex((current) => (current - 1 + highlightItems.length) % highlightItems.length);
        return;
      }

      if (event.key === "Enter") {
        const item = highlightItems[highlightedIndex];
        if (!item) {
          return;
        }

        event.preventDefault();
        activateItem(item);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [highlightItems, highlightedIndex, open]);

  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  function activateItem(item: HighlightItem) {
    if (item.kind === "variable") {
      onSelectVariable(item.data);
      return;
    }

    if (item.kind === "template") {
      onSelectTemplate(item.data);
      return;
    }

    if (!item.data.disabled) {
      onSelectAiAction?.(item.data);
    }
  }

  function getVisibleIndex(id: string) {
    return highlightItems.findIndex((item) => item.id === id);
  }

  const hasEmptyState = !loadingTemplates && highlightItems.length === 0;

  return (
    <PopupOverlay
      open={open}
      onClose={onClose}
      title="Insert into message"
      description="Search templates, variables, and future AI actions from one place."
      panelClassName="max-w-[760px]"
    >
      <div className="space-y-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-soft" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search templates or variables..."
            className="h-11 pl-10"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition",
                activeTab === tab.id
                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                  : "border-border bg-card text-text-muted hover:border-primary/25 hover:text-primary"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
          {(activeTab === "all" || activeTab === "variables") && filteredVariables.length > 0 ? (
            <section className="rounded-2xl border border-border bg-background-tint p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Variables</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">Insert reusable placeholders into the composer.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {filteredVariables.map((item) => {
                  const visibleIndex = getVisibleIndex(`variable:${item.id}`);
                  return (
                    <div key={item.id}>
                      <VariableChip
                        label={item.label}
                        value={item.value}
                        active={highlightedIndex === visibleIndex}
                        onClick={() => onSelectVariable(item)}
                      />
                      <button
                        type="button"
                        ref={(element) => {
                          itemRefs.current[visibleIndex] = element;
                        }}
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {(activeTab === "all" || activeTab === "templates") ? (
            <section className="rounded-2xl border border-border bg-background-tint p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Templates</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">Saved message templates live here for fast insertion.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {loadingTemplates ? (
                  <p className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-text-muted">
                    Loading organization templates...
                  </p>
                ) : null}
                {!loadingTemplates && filteredTemplates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card px-4 py-5 text-xs leading-5 text-text-muted">
                    <p>{templateEmptyMessage ?? "No templates match your current search."}</p>
                    {templateEmptyActionLabel && onTemplateEmptyAction ? (
                      <div className="mt-3">
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={onTemplateEmptyAction}>
                          {templateEmptyActionLabel}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {filteredTemplates.map((item) => {
                  const visibleIndex = getVisibleIndex(`template:${item.id}`);
                  return (
                    <div
                      key={item.id}
                      ref={(element) => {
                        itemRefs.current[visibleIndex] = element?.querySelector("button") ?? null;
                      }}
                    >
                      <TemplateCard
                        title={item.title}
                        category={item.category}
                        preview={item.preview ?? item.content}
                        active={highlightedIndex === visibleIndex}
                        onClick={() => onSelectTemplate(item)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {(activeTab === "all" || activeTab === "ai") && filteredAiActions.length > 0 ? (
            <section className="rounded-2xl border border-border bg-background-tint p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">AI Actions</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">Reserved for assisted writing flows without mixing them into template content.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {filteredAiActions.map((item) => {
                  const visibleIndex = getVisibleIndex(`ai:${item.id}`);
                  return (
                    <div
                      key={item.id}
                      ref={(element) => {
                        itemRefs.current[visibleIndex] = element?.querySelector("button") ?? null;
                      }}
                    >
                      <ActionCard
                        title={item.title}
                        description={item.description}
                        disabled={item.disabled}
                        active={highlightedIndex === visibleIndex}
                        onClick={() => onSelectAiAction?.(item)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {hasEmptyState ? (
            <div className="rounded-2xl border border-dashed border-border bg-background-tint px-4 py-6 text-sm leading-6 text-text-muted">
              Nothing matches that search yet. Try a template title, category, or variable name.
            </div>
          ) : null}
        </div>
      </div>
    </PopupOverlay>
  );
}