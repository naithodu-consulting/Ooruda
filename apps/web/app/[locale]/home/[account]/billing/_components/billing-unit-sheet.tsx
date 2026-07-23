'use client';

import { Building2, Calendar, Hash, Receipt } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@kit/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { DownloadPdfButton } from '~/components/download-pdf-button';
import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import type { BillLineItemRow } from './bill-line-items-dialog';
import type { BillRow } from './bills-section';

const BILL_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  other_charges: 'Other Charges',
  sinking_fund: 'Sinking Fund',
};

export function BillingUnitSheet(props: {
  bill: BillRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { bill } = props;
  const status = bill ? displayBillStatus(bill) : '';
  const outstanding = bill
    ? Math.max(0, bill.total_amount - bill.paid_amount)
    : 0;

  const lineItems = (bill?.lineItems ?? []) as BillLineItemRow[];
  const gst = bill?.gst_amount ?? 0;

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
      >
        {bill && (
          <>
            <SheetHeader className="border-b px-6 pt-6 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <Building2 className="text-muted-foreground size-4 shrink-0" />
                    <span>Unit {bill.unit_no}</span>
                  </SheetTitle>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {BILL_TYPE_LABELS[bill.bill_type] ?? bill.bill_type} ·{' '}
                    {formatPeriod(bill.period)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn('shrink-0', billStatusBadgeClassName(status))}
                >
                  {status}
                </Badge>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 px-6 py-5">
              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Billed</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {formatINR(bill.total_amount)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Paid</p>
                  <p className="mt-0.5 text-sm font-semibold text-green-700 tabular-nums dark:text-green-400">
                    {formatINR(bill.paid_amount)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Outstanding</p>
                  <p
                    className={cn(
                      'mt-0.5 text-sm font-semibold tabular-nums',
                      outstanding > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {outstanding > 0 ? formatINR(outstanding) : '—'}
                  </p>
                </div>
              </div>

              {/* Bill details */}
              <div className="space-y-2">
                <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Details
                </h4>
                <div className="divide-y rounded-lg border">
                  <DetailRow
                    icon={<Hash className="size-3.5" />}
                    label="Bill No."
                    value={bill.bill_no}
                  />
                  <DetailRow
                    icon={<Calendar className="size-3.5" />}
                    label="Due Date"
                    value={
                      bill.due_date
                        ? new Date(
                            bill.due_date.replace(/-/g, '/'),
                          ).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'
                    }
                  />
                  {bill.gst_amount != null && bill.gst_amount > 0 && (
                    <DetailRow
                      icon={<Receipt className="size-3.5" />}
                      label="GST"
                      value={formatINR(bill.gst_amount)}
                    />
                  )}
                </div>
              </div>

              {/* Line items */}
              {lineItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Breakdown
                  </h4>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">
                              {li.description}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {formatINR(li.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {gst > 0 && (
                          <TableRow>
                            <TableCell className="text-muted-foreground text-sm">
                              GST
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
                              {formatINR(gst)}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow className="font-semibold">
                          <TableCell className="text-sm">Total</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatINR(bill.total_amount)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* PDF download */}
              {bill.status !== 'Draft' && (
                <div className="space-y-2">
                  <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Documents
                  </h4>
                  <DownloadPdfButton
                    href={`/api/billing/bills/${bill.id}/pdf`}
                    label="Download bill PDF"
                    dataTest={`download-bill-${bill.id}`}
                    showLabel
                  />
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {props.icon}
        {props.label}
      </span>
      <span className="text-sm font-medium tabular-nums">{props.value}</span>
    </div>
  );
}
