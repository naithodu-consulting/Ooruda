'use client';

import { useMemo, useState } from 'react';

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

import type { AdvanceRow } from '../_lib/reports-types';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  rows: AdvanceRow[];
}

export function AdvancesTab({ rows }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.unit_no.toLowerCase().includes(q));
  }, [rows, search]);

  const totalBalance = useMemo(
    () => rows.reduce((s, r) => s + r.balance, 0),
    [rows],
  );
  const unitsWithBalance = rows.filter((r) => r.balance > 0).length;

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No advance deposit records found.
      </p>
    );
  }

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(filtered, search);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <KpiTile label="Units with Advance" value={String(rows.length)} />
        <KpiTile
          label="Units with Balance > 0"
          value={String(unitsWithBalance)}
        />
        <KpiTile
          label="Total Advance Balance"
          value={formatINR(totalBalance)}
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <Input
          data-test="advances-search"
          placeholder="Search unit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
        />
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
              <TableHead className="text-right">Balance (₹)</TableHead>
              <TableHead>Last Deposit</TableHead>
              <TableHead>Last Applied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground text-center text-sm"
                >
                  No results
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r) => (
                <TableRow key={r.unit_id}>
                  <TableCell className="font-medium">{r.unit_no}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={
                        r.balance > 0
                          ? 'text-success font-semibold'
                          : 'text-muted-foreground'
                      }
                    >
                      {formatINR(r.balance)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {r.last_deposit_date ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {r.last_applied_date ?? '-'}
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
        testPrefix="advances"
      />
    </div>
  );
}
