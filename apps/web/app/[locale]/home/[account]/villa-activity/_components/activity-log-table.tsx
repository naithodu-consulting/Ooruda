'use client';

import { usePathname } from 'next/navigation';

import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LogOut,
  Search,
  Undo2,
  XCircle,
} from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

export interface ActivityRow {
  id: string;
  action: string;
  actionLabel: string;
  reasonLabel: string | null;
  note: string | null;
  actorName: string;
  bookingId: string;
  propertyId: string;
  propertyName: string | null;
  createdAt: string;
}

function ActivityIcon({ action }: { action: string }) {
  const cls = 'text-muted-foreground h-4 w-4 shrink-0';
  if (action === 'created') return <CalendarPlus className={cls} />;
  if (action === 'cancelled') return <XCircle className="text-destructive h-4 w-4 shrink-0" />;
  if (action === 'completed') return <LogOut className={cls} />;
  if (action === 'reopened') return <Undo2 className={cls} />;
  if (action === 'checked_in') return <CheckCircle2 className={cls} />;
  return <ClipboardList className={cls} />;
}

function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function ActivityLogTable(props: {
  account: string;
  rows: ActivityRow[];
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  search: string;
  isAdmin: boolean;
}) {
  const { rows, page, totalPages, totalCount, pageSize, search, isAdmin } =
    props;
  const pathname = usePathname();
  const basePath = pathname.split('?')[0]!;

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  }

  function searchHref(q: string) {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('search', q.trim());
    return `${basePath}?${sp.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <SearchBar defaultValue={search} searchHref={searchHref} />
      </div>

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {search ? `No results for "${search}".` : 'No activity recorded yet.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Action
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Booking
                    </TableHead>
                    {isAdmin ? (
                      <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                        By
                      </TableHead>
                    ) : null}
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Note / Reason
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs font-semibold tracking-wider uppercase">
                      When
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const bookingHref = `/home/${props.account}/bookings/${row.bookingId}?property=${row.propertyId}`;
                    const detail = [row.reasonLabel, row.note]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <TableRow
                        key={row.id}
                        className="border-b last:border-0"
                        data-test={'villa-activity-row'}
                      >
                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-2">
                            <ActivityIcon action={row.action} />
                            <span className="text-sm font-medium">
                              {row.actionLabel}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <a
                            href={bookingHref}
                            className="text-primary text-sm hover:underline"
                            data-test={'villa-activity-booking-link'}
                          >
                            View booking
                          </a>
                          {row.propertyName ? (
                            <div className="text-muted-foreground mt-0.5 text-xs">
                              {row.propertyName}
                            </div>
                          ) : null}
                        </TableCell>

                        {isAdmin ? (
                          <TableCell className="py-3.5 text-sm">
                            {row.actorName}
                          </TableCell>
                        ) : null}

                        <TableCell className="text-muted-foreground min-w-40 py-3.5 text-sm break-words whitespace-normal">
                          {detail || '-'}
                        </TableCell>

                        <TableCell className="text-muted-foreground py-3.5 text-right text-sm tabular-nums">
                          {formatActivityDate(row.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="border-t px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Showing{' '}
                  <span className="text-foreground font-medium">
                    {(page - 1) * pageSize + 1}–
                    {Math.min(page * pageSize, totalCount)}
                  </span>{' '}
                  of{' '}
                  <span className="text-foreground font-medium">
                    {totalCount}
                  </span>{' '}
                  events
                </p>

                <div className="flex items-center gap-1">
                  {page > 1 ? (
                    <a
                      href={pageHref(page - 1)}
                      data-test={'villa-activity-pagination-prev'}
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </a>
                  ) : (
                    <span className="border-input text-muted-foreground inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border px-3 text-sm font-medium opacity-50">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </span>
                  )}

                  <span className="text-muted-foreground px-3 text-sm">
                    {page} / {totalPages}
                  </span>

                  {page < totalPages ? (
                    <a
                      href={pageHref(page + 1)}
                      data-test={'villa-activity-pagination-next'}
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="border-input text-muted-foreground inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border px-3 text-sm font-medium opacity-50">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SearchBar({
  defaultValue,
  searchHref: _searchHref,
}: {
  defaultValue: string;
  searchHref: (q: string) => string;
}) {
  return (
    <form method="get" className="relative w-64">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
      <input
        name="search"
        defaultValue={defaultValue}
        placeholder="Search actions…"
        className="border-input bg-background focus:ring-ring h-9 w-full rounded-md border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
        data-test={'villa-activity-search'}
      />
    </form>
  );
}
