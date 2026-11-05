'use client';

import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  Ban,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileCheck,
  LogOut,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  UserMinus,
  UserPlus,
  XCircle,
  PencilLine,
} from 'lucide-react';

import { Input } from '@kit/ui/input';
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
  bookingCode: string | null;
  propertyId: string;
  propertyName: string | null;
  createdAt: string;
}

function ActivityIcon({ action }: { action: string }) {
  const cls = 'text-muted-foreground h-4 w-4 shrink-0';
  if (action === 'created') return <CalendarPlus className={cls} />;
  if (action === 'cancelled')
    return <XCircle className="text-destructive h-4 w-4 shrink-0" />;
  if (action === 'completed') return <LogOut className={cls} />;
  if (action === 'reopened') return <Undo2 className={cls} />;
  if (action === 'checked_in') return <CheckCircle2 className={cls} />;
  if (action === 'booking_updated') return <PencilLine className={cls} />;
  if (action === 'enrichment_voided')
    return <Ban className="text-destructive h-4 w-4 shrink-0" />;
  if (action === 'payment_recorded') return <CreditCard className={cls} />;
  if (action === 'payment_voided')
    return <Ban className="text-destructive h-4 w-4 shrink-0" />;
  if (action === 'refund_recorded') return <RotateCcw className={cls} />;
  if (action === 'id_recorded') return <FileCheck className={cls} />;
  if (action === 'id_verified') return <ShieldCheck className={cls} />;
  if (action === 'id_deleted')
    return <Trash2 className="text-destructive h-4 w-4 shrink-0" />;
  if (action === 'email_sent') return <Mail className={cls} />;
  if (action === 'guest_added') return <UserPlus className={cls} />;
  if (action === 'guest_removed') return <UserMinus className={cls} />;
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
  subtitle?: string;
  isAdmin: boolean;
}) {
  const {
    rows,
    page,
    totalPages,
    totalCount,
    pageSize,
    search,
    subtitle,
    isAdmin,
  } = props;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        {subtitle ? (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        ) : (
          <span />
        )}
        <SearchBar defaultValue={search} searchHref={searchHref} />
      </div>

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {search
              ? `No results for "${search}".`
              : 'No activity recorded yet.'}
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
                          <Link
                            href={bookingHref}
                            className="text-brand-ink text-sm font-medium hover:underline"
                            data-test={'villa-activity-booking-link'}
                          >
                            {row.bookingCode ? (
                              <span className="font-mono">
                                {row.bookingCode}
                              </span>
                            ) : (
                              'View booking'
                            )}
                          </Link>
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
                    <Link
                      href={pageHref(page - 1)}
                      data-test={'villa-activity-pagination-prev'}
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Link>
                  ) : (
                    <span className="border-input text-muted-foreground inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border px-3 text-sm font-medium opacity-50">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </span>
                  )}

                  <span className="text-muted-foreground px-3 text-sm tabular-nums">
                    {page} / {totalPages}
                  </span>

                  {page < totalPages ? (
                    <Link
                      href={pageHref(page + 1)}
                      data-test={'villa-activity-pagination-next'}
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Link>
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
  searchHref,
}: {
  defaultValue: string;
  searchHref: (q: string) => string;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const searchHrefRef = useRef(searchHref);
  searchHrefRef.current = searchHref;
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      routerRef.current.push(searchHrefRef.current(value));
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  return (
    <form
      method="get"
      className="relative w-full sm:w-64"
      onSubmit={(e) => {
        e.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        router.push(searchHref(value));
      }}
    >
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
      <Input
        name="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search actions, booking, notes…"
        className="w-full pl-8"
        data-test={'villa-activity-search'}
      />
    </form>
  );
}
