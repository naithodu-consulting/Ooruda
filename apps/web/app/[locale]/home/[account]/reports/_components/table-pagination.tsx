'use client';

import { useEffect, useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Rows per page across every Reports table. */
export const REPORTS_PAGE_SIZE = 25;

interface PagedResult<T> {
  page: number;
  setPage: (p: number) => void;
  paged: T[];
  totalPages: number;
  total: number;
  /** 1-based index of the first row on the current page (0 when empty). */
  fromIndex: number;
  /** 1-based index of the last row on the current page. */
  toIndex: number;
}

/**
 * Client-side pagination for a fully-loaded row set.
 *
 * `resetKey` should change whenever the caller's filter/sort selection changes,
 * so the view returns to page 1. Without it, narrowing a filter while on a late
 * page leaves the user staring at an empty table that looks like "no results".
 */
export function usePagedRows<T>(
  rows: T[],
  resetKey: unknown = null,
  pageSize: number = REPORTS_PAGE_SIZE,
): PagedResult<T> {
  const [page, setPage] = useState(1);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Reset on filter change and whenever the underlying data set is replaced.
  useEffect(() => {
    setPage(1);
  }, [resetKey, total]);

  // Guard against a page index that no longer exists (e.g. rows shrank).
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);

  return {
    page: safePage,
    setPage,
    paged,
    totalPages,
    total,
    fromIndex: total === 0 ? 0 : start + 1,
    toIndex: Math.min(start + pageSize, total),
  };
}

interface Props {
  page: number;
  totalPages: number;
  total: number;
  fromIndex: number;
  toIndex: number;
  onPageChange: (p: number) => void;
  /** Plural noun for the row type, e.g. "entries", "units", "payments". */
  label?: string;
  /** Test id prefix, e.g. "payments" → payments-pagination-next. */
  testPrefix: string;
}

/**
 * Shared pagination footer for Reports tables. Matches the audit-log footer so
 * pagination reads the same everywhere in the app.
 */
export function TablePagination({
  page,
  totalPages,
  total,
  fromIndex,
  toIndex,
  onPageChange,
  label = 'rows',
  testPrefix,
}: Props) {
  // A single page needs no controls, but the count is still useful context.
  const btn =
    'border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        {total === 0 ? (
          <>No {label}</>
        ) : (
          <>
            Showing{' '}
            <span className="text-foreground font-medium tabular-nums">
              {fromIndex}–{toIndex}
            </span>{' '}
            of{' '}
            <span className="text-foreground font-medium tabular-nums">
              {total}
            </span>{' '}
            {label}
          </>
        )}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            data-test={`${testPrefix}-pagination-prev`}
            className={btn}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-muted-foreground px-3 text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            data-test={`${testPrefix}-pagination-next`}
            className={btn}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
