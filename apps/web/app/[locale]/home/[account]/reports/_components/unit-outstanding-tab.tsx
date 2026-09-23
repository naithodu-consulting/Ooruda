'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatINR } from '~/lib/format-inr';

import type { UnitOutstandingRow } from '../_lib/reports-types';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  rows: UnitOutstandingRow[];
}

export function UnitOutstandingTab({ rows }: Props) {
  const [defaulterOnly, setDefaulterOnly] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let r = rows;
    if (defaulterOnly) r = r.filter((x) => x.overdue_count > 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (x) =>
          x.unit_no.toLowerCase().includes(q) ||
          (x.owner_name?.toLowerCase().includes(q) ?? false) ||
          (x.owner_phone?.includes(q) ?? false),
      );
    }
    return r;
  }, [rows, defaulterOnly, search]);

  const totalUnits = rows.length;
  const totalOutstanding = rows.reduce((s, r) => s + r.total_outstanding, 0);
  const defaulterCount = rows.filter((r) => r.overdue_count > 0).length;

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No outstanding dues for the selected period.
      </p>
    );
  }

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, `${search}|${defaulterOnly}`);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <KpiTile label="Units with Outstanding" value={String(totalUnits)} />
        <KpiTile
          label="Total Outstanding"
          value={formatINR(totalOutstanding)}
        />
        <KpiTile label="Defaulters (Overdue)" value={String(defaulterCount)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          data-test="unit-outstanding-search"
          placeholder="Search unit / owner / phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56 text-sm"
        />
        <Button
          data-test="defaulter-toggle"
          variant={defaulterOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDefaulterOnly((v) => !v)}
        >
          {defaulterOnly ? 'All Units' : 'Defaulters Only'}
        </Button>
        <span className="text-muted-foreground text-xs">
          {filtered.length} unit{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Owner / Tenant</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Outstanding (₹)</TableHead>
              <TableHead className="text-right">Overdue Bills</TableHead>
              <TableHead>Last Payment</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground text-center text-sm"
                >
                  No results
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r) => (
                <TableRow key={r.unit_id}>
                  <TableCell className="font-medium">{r.unit_no}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.owner_name ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {r.owner_phone ?? '-'}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatINR(r.total_outstanding)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.overdue_count > 0 ? (
                      <span className="text-destructive font-semibold">
                        {r.overdue_count}
                      </span>
                    ) : (
                      '0'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {r.last_payment_date ?? 'Never'}
                  </TableCell>
                  <TableCell>
                    {r.overdue_count > 0 ? (
                      <Badge className="text-destructive border-red-200 bg-red-50 text-xs">
                        Overdue
                      </Badge>
                    ) : (
                      <Badge className="text-warning border-amber-200 bg-amber-50 text-xs">
                        Pending
                      </Badge>
                    )}
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
        label="units"
        testPrefix="unit-outstanding"
      />
    </div>
  );
}
