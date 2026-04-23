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
    <div className={`flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted ${className}`}>
      <p>
        Showing {firstItem}-{lastItem} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="px-3 py-2 text-xs"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <span className="font-medium text-text-soft">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="secondary"
          className="px-3 py-2 text-xs"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
