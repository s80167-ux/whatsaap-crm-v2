import { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";

export const PANEL_PAGE_SIZE = 5;

export function usePanelPagination<T>(items: T[], pageSize = PANEL_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount));
  }, [pageCount]);

  const visibleItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    pageCount,
    pageSize,
    totalItems: items.length,
    visibleItems,
    showPagination: items.length > pageSize,
    setPage
  };
}

export function PanelPagination({
  page,
  pageCount,
  pageSize = PANEL_PAGE_SIZE,
  totalItems,
  onPageChange,
  className = ""
}: {
  page: number;
  pageCount: number;
  pageSize?: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalItems <= pageSize) {
    return null;
  }

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className={`app-card flex flex-col gap-3 rounded-2xl px-3 py-3 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-4 ${className}`}>
      <p className="text-xs font-medium text-text-muted">
        Showing {firstItem}-{lastItem} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          variant="secondary"
          className="min-h-[2.2rem] px-3 py-2 text-xs"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <span className="inline-flex min-h-[2.2rem] items-center rounded-xl border border-border bg-muted px-3 text-xs font-semibold text-text-soft">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="secondary"
          className="min-h-[2.2rem] px-3 py-2 text-xs"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
