'use client';

import { useEffect, useRef, useState } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { ChevronLeft, ChevronRight, Download, Filter } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { DatePicker } from '@kit/ui/date-picker';
import { SearchableSelect } from '@kit/ui/searchable-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import {
  ActionIcon,
  actionLabel,
  ADMIN_EVENT_TYPE_TABS,
  AuditSearchBar,
  EventTypeTabs,
  truncateSummary,
  TypeBadge,
} from '../../../home/[account]/audit/_components/audit-shared';

function formatAuditDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export interface AdminActivityRow {
  id: string;
  action: string;
  summary: string | null;
  actor: string;
  association: string;
  created_at: string;
  eventType: string;
  statusCode: number | null;
  errorCode: string | null;
  path: string | null;
}

export interface AssocOption {
  id: string;
  name: string;
}

/** Select has no empty-string value, so the "all" option needs a sentinel. */
const ALL_ASSOCIATIONS = '__all__';

export function AdminActivityCard(props: {
  rows: AdminActivityRow[];
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  search: string;
  eventType: string;
  dateFrom: string;
  dateTo: string;
  isDefaultRange: boolean;
  assocId: string;
  associations: AssocOption[];
}) {
  const {
    rows,
    page,
    totalPages,
    totalCount,
    pageSize,
    search,
    eventType,
    dateFrom,
    dateTo,
    isDefaultRange,
    assocId,
    associations,
  } = props;

  const pathname = usePathname();
  const router = useRouter();
  const basePath = pathname.split('?')[0]!;

  const [localFrom, setLocalFrom] = useState(dateFrom);
  const [localTo, setLocalTo] = useState(dateTo);

  // Keep local date state in sync when server-rendered defaults change
  const prevDateFrom = useRef(dateFrom);
  const prevDateTo = useRef(dateTo);
  useEffect(() => {
    if (prevDateFrom.current !== dateFrom) {
      setLocalFrom(dateFrom);
      prevDateFrom.current = dateFrom;
    }
    if (prevDateTo.current !== dateTo) {
      setLocalTo(dateTo);
      prevDateTo.current = dateTo;
    }
  }, [dateFrom, dateTo]);

  function buildParams(overrides: Record<string, string> = {}) {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (eventType) sp.set('eventType', eventType);
    if (assocId) sp.set('assocId', assocId);
    sp.set('dateFrom', localFrom);
    sp.set('dateTo', localTo);
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) sp.set(k, v);
      else sp.delete(k);
    });
    return sp.toString();
  }

  function tabHref(et: string) {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (et) sp.set('eventType', et);
    if (assocId) sp.set('assocId', assocId);
    sp.set('dateFrom', localFrom);
    sp.set('dateTo', localTo);
    return `${basePath}?${sp.toString()}`;
  }

  function pageHref(p: number) {
    return `${basePath}?${buildParams({ page: String(p) })}`;
  }

  function applyDateRange() {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (eventType) sp.set('eventType', eventType);
    if (assocId) sp.set('assocId', assocId);
    sp.set('dateFrom', localFrom);
    sp.set('dateTo', localTo);
    router.push(`${basePath}?${sp.toString()}`);
  }

  function onAssocChange(id: string) {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (eventType) sp.set('eventType', eventType);
    if (id) sp.set('assocId', id);
    sp.set('dateFrom', localFrom);
    sp.set('dateTo', localTo);
    router.push(`${basePath}?${sp.toString()}`);
  }

  function csvHref() {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (eventType) sp.set('eventType', eventType);
    if (assocId) sp.set('assocId', assocId);
    sp.set('dateFrom', localFrom);
    sp.set('dateTo', localTo);
    return `/api/admin/activity/export?${sp.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: description + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {isDefaultRange ? (
            <>
              Showing last 7 days by default.{' '}
              <span className="text-foreground font-medium">
                {totalCount} event{totalCount === 1 ? '' : 's'}
              </span>{' '}
              matched.
            </>
          ) : (
            <>
              <span className="text-foreground font-medium">
                {totalCount} event{totalCount === 1 ? '' : 's'}
              </span>{' '}
              from {dateFrom} to {dateTo}.
            </>
          )}
        </p>
        <AuditSearchBar
          defaultValue={search}
          basePath={basePath}
          eventType={eventType}
          testId="admin-activity-search"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-end gap-3">
        <Filter className="text-muted-foreground mb-1.5 h-4 w-4 shrink-0" />

        {/* Date range */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">
              From
            </label>
            <DatePicker
              value={localFrom}
              onChange={setLocalFrom}
              max={localTo}
              data-test="activity-date-from"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">
              To
            </label>
            <DatePicker
              value={localTo}
              onChange={setLocalTo}
              min={localFrom}
              data-test="activity-date-to"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={applyDateRange}
            className="h-9"
            data-test="activity-date-apply"
          >
            Apply
          </Button>
        </div>

        {/* Association filter */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            Association
          </label>
          <SearchableSelect
            items={[
              { value: ALL_ASSOCIATIONS, label: 'All associations' },
              ...associations.map((a) => ({ value: a.id, label: a.name })),
            ]}
            value={assocId === '' ? ALL_ASSOCIATIONS : assocId}
            onChange={(value) =>
              onAssocChange(!value || value === ALL_ASSOCIATIONS ? '' : value)
            }
            placeholder="All associations"
            searchPlaceholder="Search associations…"
            emptyMessage="No associations found"
            className="h-9"
            data-test="activity-assoc-filter"
          />
        </div>

        {/* CSV export */}
        <a
          href={csvHref()}
          download
          className="border-input bg-background hover:bg-accent ml-auto inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors"
          data-test="activity-export-csv"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </div>

      <EventTypeTabs
        eventType={eventType}
        tabHref={tabHref}
        testPrefix="admin-filter-tab"
        tabs={ADMIN_EVENT_TYPE_TABS}
      />

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {search
              ? `No results for "${search}".`
              : 'No events in this date range.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="text-muted-foreground w-48 text-xs font-semibold tracking-wider uppercase">
                      Event
                    </TableHead>
                    <TableHead className="text-muted-foreground w-32 text-xs font-semibold tracking-wider uppercase">
                      User
                    </TableHead>
                    <TableHead className="text-muted-foreground w-40 text-xs font-semibold tracking-wider uppercase">
                      Association
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Details
                    </TableHead>
                    <TableHead className="text-muted-foreground w-24 text-xs font-semibold tracking-wider uppercase">
                      Type
                    </TableHead>
                    <TableHead className="text-muted-foreground w-40 text-right text-xs font-semibold tracking-wider uppercase">
                      Date
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="border-b last:border-0">
                      <TableCell className="py-3.5">
                        <div className="flex items-start gap-2">
                          <ActionIcon action={row.action} />
                          <div>
                            <span className="text-sm font-medium">
                              {actionLabel(row.action)}
                            </span>
                            {row.path && (
                              <div className="text-muted-foreground mt-0.5 max-w-[176px] truncate font-mono text-[10px]">
                                {row.path}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-sm">
                        {row.actor}
                      </TableCell>
                      <TableCell className="text-muted-foreground py-3.5 text-sm">
                        {row.association}
                      </TableCell>
                      <TableCell className="text-muted-foreground py-3.5 text-sm">
                        {truncateSummary(row.summary)}
                        {row.errorCode && (
                          <div className="text-destructive mt-0.5 font-mono text-[10px]">
                            {row.errorCode}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <TypeBadge
                          statusCode={row.statusCode}
                          eventType={row.eventType}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground py-3.5 text-right text-sm">
                        {formatAuditDate(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
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
                      data-test="admin-activity-pagination-prev"
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </a>
                  ) : (
                    <span className="border-input text-muted-foreground inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border px-3 text-sm font-medium opacity-50">
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </span>
                  )}

                  <span className="text-muted-foreground px-3 text-sm">
                    {page} / {totalPages}
                  </span>

                  {page < totalPages ? (
                    <a
                      href={pageHref(page + 1)}
                      data-test="admin-activity-pagination-next"
                      className="border-input bg-background hover:bg-accent inline-flex h-8 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="border-input text-muted-foreground inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border px-3 text-sm font-medium opacity-50">
                      Next <ChevronRight className="h-4 w-4" />
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
