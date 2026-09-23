'use client';

import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import type { DirectoryRow } from '../_lib/reports-types';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  rows: DirectoryRow[];
  roleFilter: 'all' | 'Owner' | 'Tenant';
  onRoleFilterChange: (v: 'all' | 'Owner' | 'Tenant') => void;
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'Owner', label: 'Owners' },
  { value: 'Tenant', label: 'Tenants' },
] as const;

export function DirectoryTab({ rows, roleFilter, onRoleFilterChange }: Props) {
  const filtered =
    roleFilter === 'all' ? rows : rows.filter((r) => r.role === roleFilter);

  const owners = rows.filter((r) => r.role === 'Owner').length;
  const tenants = rows.filter((r) => r.role === 'Tenant').length;

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, roleFilter);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Total Entries" value={String(rows.length)} />
        <KpiTile label="Owners" value={String(owners)} />
        <KpiTile label="Tenants" value={String(tenants)} highlight="amber" />
      </div>

      {/* Role filter pills */}
      <div className="flex flex-wrap gap-2">
        {ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            data-test={`directory-filter-${opt.value}`}
            onClick={() => onRoleFilterChange(opt.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              roleFilter === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground hover:border-foreground/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tenant / Owner Directory</CardTitle>
          <CardDescription>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {roleFilter !== 'all' ? ` · ${roleFilter}s only` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Move-In Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground py-10 text-center text-sm"
                    >
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((r, i) => (
                    <TableRow key={`${r.unit_id}-${r.role}-${i}`}>
                      <TableCell className="font-medium">{r.unit_no}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.phone ?? '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {r.email ?? '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.role === 'Owner'
                              ? 'text-info border-blue-300 dark:border-blue-700'
                              : 'border-warning/40 text-warning'
                          }
                        >
                          {r.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.move_in_date
                          ? new Date(r.move_in_date).toLocaleDateString(
                              'en-IN',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              },
                            )
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            fromIndex={fromIndex}
            toIndex={toIndex}
            onPageChange={setPage}
            label="records"
            testPrefix="directory"
          />
        </CardContent>
      </Card>
    </div>
  );
}
