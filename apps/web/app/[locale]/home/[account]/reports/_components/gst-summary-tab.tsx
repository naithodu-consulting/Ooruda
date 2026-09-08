'use client';

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

import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { billTypeLabel, type GstSummaryRow } from '../_lib/reports-types';
import { KpiTile } from './kpi-tile';
import { TablePagination, usePagedRows } from './table-pagination';

interface Props {
  rows: GstSummaryRow[];
}

export function GstSummaryTab({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16">
        <p className="text-lg font-semibold">No GST data found</p>
        <p className="text-muted-foreground text-sm">
          No bills with GST amounts exist for the selected period.
        </p>
      </div>
    );
  }

  const totalTaxable = rows.reduce((s, r) => s + r.taxable_amount, 0);
  const totalGst = rows.reduce((s, r) => s + r.gst_amount, 0);
  const totalBilled = rows.reduce((s, r) => s + r.total_amount, 0);
  const totalCollectedGst = rows.reduce((s, r) => s + r.collected_gst, 0);
  const gstCollectionRate =
    totalGst > 0 ? Math.round((totalCollectedGst / totalGst) * 100) : 0;

  const { page, setPage, paged, totalPages, total, fromIndex, toIndex } =
    usePagedRows(rows, null);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Total Taxable"
          value={formatINR(totalTaxable)}
          sub="excl. GST"
        />
        <KpiTile
          label="Total GST Billed"
          value={formatINR(totalGst)}
          highlight="amber"
          sub="CGST + SGST"
        />
        <KpiTile
          label="Total Billed"
          value={formatINR(totalBilled)}
          sub="taxable + GST"
        />
        <KpiTile
          label="GST Collected"
          value={formatINR(totalCollectedGst)}
          highlight="green"
          sub={`${gstCollectionRate}% collection rate`}
        />
      </div>

      {/* Period × Bill Type breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">GST Breakdown</CardTitle>
          <CardDescription>
            Period and charge type wise taxable base, GST billed, and GST
            collected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Charge Type</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Taxable (₹)</TableHead>
                  <TableHead className="text-right">GST Billed (₹)</TableHead>
                  <TableHead className="text-right">Total Billed (₹)</TableHead>
                  <TableHead className="text-right">
                    GST Collected (₹)
                  </TableHead>
                  <TableHead className="text-right">Pending GST (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => {
                  const pendingGst = r.gst_amount - r.collected_gst;
                  return (
                    <TableRow key={`${r.period}-${r.bill_type}`}>
                      <TableCell>{formatPeriod(r.period)}</TableCell>
                      <TableCell>{billTypeLabel(r.bill_type)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.bill_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(r.taxable_amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatINR(r.gst_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(r.total_amount)}
                      </TableCell>
                      <TableCell className="text-right text-[var(--color-success)] tabular-nums">
                        {formatINR(r.collected_gst)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${pendingGst > 0 ? 'text-[var(--color-warning)]' : 'text-muted-foreground'}`}
                      >
                        {formatINR(Math.max(0, pendingGst))}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
            label="periods"
            testPrefix="gst-summary"
          />
        </CardContent>
      </Card>

      {/* Tax liability note */}
      <p className="text-muted-foreground text-xs">
        GST amounts are sourced from billed GST on each invoice. Collected GST
        is estimated proportionally from total payments received.{' '}
        <span className="font-medium">Verify against your GSTIN filings.</span>
      </p>
    </div>
  );
}
