import Link from 'next/link';

import { ChevronLeft, ChevronRight } from 'lucide-react';

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

const ACTION_LABELS: Record<string, string> = {
  'unit.created': 'Unit added',
  'unit.updated': 'Unit updated',
  'unit.deleted': 'Unit deleted',
  'unit.owner_assigned': 'Owner assigned',
  'unit.owner_unassigned': 'Owner unassigned',
  'unit.bulk_imported': 'Bulk CSV import',
  'tenancy.started': 'Tenant assigned',
  'tenancy.ended': 'Tenancy ended',
  'bill.generated': 'Bill generated',
  'bill.updated': 'Bill updated',
  'payment.recorded': 'Payment recorded',
  'mescom.reading_added': 'MESCOM reading added',
  'mescom.bill_created': 'MESCOM bill uploaded',
  'billing_settings.updated': 'Billing settings updated',
  'notifications.bulk_sent': 'Bulk reminders sent',
};

function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function RoleBadge({ roleLabel }: { roleLabel: string | null }) {
  if (!roleLabel)
    return <span className="text-muted-foreground text-xs">—</span>;

  const isAdmin = roleLabel === 'Association Admin';
  const isOperator = roleLabel === 'Billing Operator';

  const dotColor = isAdmin
    ? 'bg-purple-500'
    : isOperator
      ? 'bg-emerald-500'
      : 'bg-slate-400';

  const textColor = isAdmin
    ? 'text-purple-600 dark:text-purple-400'
    : isOperator
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-slate-600 dark:text-slate-400';

  const shortLabel = isAdmin ? 'Admin' : isOperator ? 'Operator' : roleLabel;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-medium ${textColor}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {shortLabel}
    </span>
  );
}

export function AuditLogCard(props: {
  rows: AuditLogRow[];
  page: number;
  totalPages: number;
  totalCount: number;
  account: string;
}) {
  const { rows, page, totalPages, totalCount, account } = props;
  const baseUrl = `/home/${account}/audit`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">Audit log</h2>
        <p className="text-muted-foreground text-sm">All system actions</p>
      </div>

      <div className="dark:bg-card rounded-xl border bg-white">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Nothing has happened here yet.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Action
                  </TableHead>
                  <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Actor
                  </TableHead>
                  <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Role
                  </TableHead>
                  <TableHead className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Entity
                  </TableHead>
                  <TableHead className="text-muted-foreground text-right text-xs font-semibold tracking-wider uppercase">
                    Timestamp
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
                      {row.summary ?? row.entity_type}
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
                    <Link
                      href={`${baseUrl}?page=${page - 1}`}
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

                  <span className="text-muted-foreground px-3 text-sm">
                    {page} / {totalPages}
                  </span>

                  {page < totalPages ? (
                    <Link
                      href={`${baseUrl}?page=${page + 1}`}
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
