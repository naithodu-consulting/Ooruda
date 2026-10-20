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

import type { OccupancyRow } from '../_lib/reports-types';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  rows: OccupancyRow[];
  statusFilter: 'all' | 'occupied' | 'vacant';
  onStatusFilterChange: (v: 'all' | 'occupied' | 'vacant') => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Units' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'vacant', label: 'Vacant' },
] as const;

export function OccupancyTab({
  rows,
  statusFilter,
  onStatusFilterChange,
}: Props) {
  const filtered =
    statusFilter === 'all'
      ? rows
      : rows.filter((r) =>
          statusFilter === 'occupied'
            ? r.status === 'Occupied'
            : r.status === 'Vacant',
        );

  const total = rows.length;
  const occupied = rows.filter((r) => r.status === 'Occupied').length;
  const vacant = total - occupied;
  const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const {
    page,
    setPage,
    paged,
    totalPages,
    total: pagedTotal,
    fromIndex,
    toIndex,
  } = usePagedRows(filtered, statusFilter);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Total Units" value={String(total)} />
        <KpiTile label="Occupied" value={String(occupied)} highlight="green" />
        <KpiTile label="Vacant" value={String(vacant)} highlight="amber" />
        <KpiTile label="Occupancy Rate" value={`${rate}%`} />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            data-test={`occupancy-filter-${opt.value}`}
            onClick={() => onStatusFilterChange(opt.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === opt.value
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
          <CardTitle className="text-base">Unit Occupancy</CardTitle>
          <CardDescription>
            {filtered.length} unit{filtered.length !== 1 ? 's' : ''} shown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead className="text-right">Area (sqft)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Occupant</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Move-In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-muted-foreground py-10 text-center text-sm"
                    >
                      No units found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((r) => (
                    <TableRow key={r.unit_id}>
                      <TableCell className="font-medium">{r.unit_no}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>{r.floor ?? '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.area_sqft.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === 'Occupied' ? 'default' : 'outline'
                          }
                          className={
                            r.status === 'Occupied'
                              ? 'border-success/30 bg-success/15 text-success'
                              : 'border-warning/40 text-warning'
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.occupant_name ?? '-'}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.occupant_phone ?? '-'}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {r.occupant_email ?? '-'}
                      </TableCell>
                      <TableCell>
                        {r.occupant_role ? (
                          <span className="text-muted-foreground text-xs">
                            {r.occupant_role}
                          </span>
                        ) : (
                          '-'
                        )}
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
            total={pagedTotal}
            fromIndex={fromIndex}
            toIndex={toIndex}
            onPageChange={setPage}
            label="units"
            testPrefix="occupancy"
          />
        </CardContent>
      </Card>
    </div>
  );
}
