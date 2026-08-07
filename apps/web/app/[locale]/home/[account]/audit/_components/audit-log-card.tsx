'use client';

import { usePathname } from 'next/navigation';

import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  ASSOC_EVENT_TYPE_TABS,
  AuditSearchBar,
  EventTypeTabs,
  StatusBadge,
  truncateSummary,
} from './audit-shared';

function formatAuditDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleString('en-IN', {
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const month = date.toLocaleString('en-IN', {
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const year = date.toLocaleString('en-IN', {
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const time = date.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
  return `${day} ${month} ${year}, ${time}`;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  summary: string | null;
  actor: string;
  actorRoleLabel: string | null;
  created_at: string;
  eventType: string;
  statusCode: number | null;
  errorCode: string | null;
  path: string | null;
}

function RoleBadge({ roleLabel }: { roleLabel: string | null }) {
  if (!roleLabel)
    return <span className="text-muted-foreground text-xs">—</span>;

  const isSuperAdmin = roleLabel === 'Super Admin';
  const isAdmin = roleLabel === 'Association Admin';
  const isOperator = roleLabel === 'Billing Operator';

  const shortLabel = isSuperAdmin
    ? 'Super Admin'
    : isAdmin
      ? 'Admin'
      : isOperator
        ? 'Operator'
        : roleLabel;

  return (
    <span
      className={
        isSuperAdmin
          ? 'text-destructive text-sm font-medium'
          : isAdmin
            ? 'text-primary text-sm font-medium'
            : isOperator
              ? 'text-sm font-medium text-[var(--color-success)]'
              : 'text-muted-foreground text-sm font-medium'
      }
    >
      {shortLabel}
    </span>
  );
}

export function AuditLogCard(props: {
  rows: AuditLogRow[];
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  search: string;
  eventType: string;
}) {
  const { rows, page, totalPages, totalCount, pageSize, search, eventType } =
    props;
  const pathname = usePathname();
  const basePath = pathname.split('?')[0]!;

  function tabHref(et: string) {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (et) sp.set('eventType', et);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    if (eventType) sp.set('eventType', eventType);
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Activity Log</h2>
          <p className="text-muted-foreground text-sm">
            All events, actions, and system events
          </p>
        </div>
        <AuditSearchBar
          defaultValue={search}
          basePath={basePath}
          eventType={eventType}
        />
      </div>

      <EventTypeTabs
        eventType={eventType}
        tabHref={tabHref}
        tabs={ASSOC_EVENT_TYPE_TABS}
      />

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {search
              ? `No results for "${search}".`
              : 'Nothing logged here yet.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Event
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      User
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Role
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Details
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Status
                    </TableHead>
                    <TableHead className="text-muted-foreground text-right text-xs font-semibold tracking-wider uppercase">
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
                              <div className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                                {row.path}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-sm">
                        {row.actor}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <RoleBadge roleLabel={row.actorRoleLabel} />
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
                        <StatusBadge
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
                      data-test="audit-pagination-prev"
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
                      data-test="audit-pagination-next"
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
