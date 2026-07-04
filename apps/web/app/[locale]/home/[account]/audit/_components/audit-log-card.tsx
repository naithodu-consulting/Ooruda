'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatTimestampDMY } from '~/lib/format-date';

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  summary: string | null;
  actor: string;
  actorRoleLabel: string | null;
  created_at: string;
}

// Keys must match exactly what is written to audit_logs.action in the DB
const ACTION_LABELS: Record<string, string> = {
  'unit.created': 'Unit added',
  'unit.updated': 'Unit updated',
  'unit.deleted': 'Unit deleted',
  'unit.owner_assigned': 'Owner assigned',
  'unit.owner_unassigned': 'Owner unassigned',
  'unit.bulk_imported': 'Bulk unit import',
  'tenancy.started': 'Tenant assigned',
  'tenancy.ended': 'Tenancy ended',
  'bills.generated': 'Bills generated',
  'bills.generation.failed': 'Bill generation failed',
  'bill.updated': 'Bill updated',
  'bill.pdf_generated': 'Bill PDF generated',
  'payment.recorded': 'Payment recorded',
  'payment.record.failed': 'Payment failed',
  'payment.voided': 'Payment voided',
  'payment.void.failed': 'Payment void failed',
  'receipt.pdf_generated': 'Receipt PDF generated',
  'mescom_bill.created': 'Electricity bill added',
  'mescom_bill.create.failed': 'Electricity bill failed',
  'mescom_bill.deleted': 'Electricity bill deleted',
  'mescom_bill.delete.failed': 'Electricity bill delete failed',
  'meter_readings.recorded': 'Meter readings recorded',
  'meter_readings.record.failed': 'Meter readings failed',
  'meter_readings.bulk_imported': 'Meter readings imported',
  'meter_readings.bulk_import.failed': 'Meter readings import failed',
  'sub_meter.bulk_imported': 'Sub-meters imported',
  'sub_meter.bulk_import.failed': 'Sub-meter import failed',
  'billing_settings.updated': 'Billing settings updated',
  'notifications.bulk_sent': 'Bulk reminders sent',
};

function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function truncateSummary(summary: string | null): string {
  if (!summary) return '—';
  const braceIdx = summary.search(/[{[]/);
  const stripped = braceIdx > 0 ? summary.slice(0, braceIdx).trim() : '';
  const text = stripped || (braceIdx === 0 ? 'An error occurred.' : summary);
  return text.length > 90 ? text.slice(0, 87) + '…' : text;
}

function RoleBadge({ roleLabel }: { roleLabel: string | null }) {
  if (!roleLabel)
    return <span className="text-muted-foreground text-xs">—</span>;

  const isAdmin = roleLabel === 'Association Admin';
  const isOperator = roleLabel === 'Billing Operator';
  const isSuperAdmin = roleLabel === 'Super Admin';

  const dotColor = isSuperAdmin
    ? 'bg-rose-500'
    : isAdmin
      ? 'bg-purple-500'
      : isOperator
        ? 'bg-emerald-500'
        : 'bg-slate-400';

  const textColor = isSuperAdmin
    ? 'text-rose-600 dark:text-rose-400'
    : isAdmin
      ? 'text-purple-600 dark:text-purple-400'
      : isOperator
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-600 dark:text-slate-400';

  const shortLabel = isSuperAdmin
    ? 'Super Admin'
    : isAdmin
      ? 'Admin'
      : isOperator
        ? 'Operator'
        : roleLabel;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-medium ${textColor}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {shortLabel}
    </span>
  );
}

function SearchBar({
  defaultValue,
  basePath,
}: {
  defaultValue: string;
  basePath: string;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const url = value.trim()
        ? `${basePath}?search=${encodeURIComponent(value.trim())}`
        : basePath;
      routerRef.current.push(url);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, basePath]);

  return (
    <div className="relative w-64">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search events, users, details…"
        className="border-input bg-background focus:ring-ring h-9 w-full rounded-md border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
      />
    </div>
  );
}

export function AuditLogCard(props: {
  rows: AuditLogRow[];
  page: number;
  totalPages: number;
  totalCount: number;
  account: string;
  search: string;
}) {
  const { rows, page, totalPages, totalCount, account, search } = props;
  const pathname = usePathname();
  const basePath = pathname.split('?')[0]!;
  const pageQuery = search
    ? `?search=${encodeURIComponent(search)}&page=`
    : `?page=`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Audit log</h2>
          <p className="text-muted-foreground text-sm">All system actions</p>
        </div>
        <SearchBar defaultValue={search} basePath={basePath} />
      </div>

      <div className="dark:bg-card rounded-xl border bg-white">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {search
              ? `No results for "${search}".`
              : 'Nothing has happened here yet.'}
          </p>
        ) : (
          <>
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
                  <TableHead className="text-muted-foreground text-right text-xs font-semibold tracking-wider uppercase">
                    Date
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="border-b last:border-0">
                    <TableCell className="py-3.5 text-sm font-medium">
                      {actionLabel(row.action)}
                    </TableCell>
                    <TableCell className="py-3.5 text-sm">
                      {row.actor}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <RoleBadge roleLabel={row.actorRoleLabel} />
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3.5 text-sm">
                      {truncateSummary(row.summary)}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3.5 text-right text-sm">
                      {formatTimestampDMY(row.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="border-t px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Showing{' '}
                  <span className="text-foreground font-medium">
                    {(page - 1) * 25 + 1}–{Math.min(page * 25, totalCount)}
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
                      href={`${basePath}${pageQuery}${page - 1}`}
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
                      href={`${basePath}${pageQuery}${page + 1}`}
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
