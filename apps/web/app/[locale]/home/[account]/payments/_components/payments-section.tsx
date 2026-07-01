'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { cn } from '@kit/ui/utils';

import { billStatusBadgeClassName, displayBillStatus } from '~/lib/bill-status';
import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { BillPaymentsDialog, type PaymentRow } from './bill-payments-dialog';
import { RecordPaymentDialog } from './record-payment-dialog';

export interface BillPaymentRow {
  id: string;
  period: string;
  bill_no: string;
  unit_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  payments: PaymentRow[];
}

export function PaymentsSection(props: {
  associationId: string;
  bills: BillPaymentRow[];
  canManage: boolean;
  canVoid: boolean;
  title?: string;
  description?: string;
  page?: number;
  totalPages?: number;
  totalCount?: number;
  accountSlug?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = props.page ?? 1;
  const totalPages = props.totalPages ?? 1;
  const totalCount = props.totalCount ?? 0;
  const baseUrl = `/home/${props.accountSlug}/payments`;

  const statusVal = searchParams.get('status') ?? 'all';
  const typeVal = searchParams.get('type') ?? 'all';
  const durationVal = searchParams.get('duration') ?? 'all';

  const updateFilters = (newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([key, val]) => {
      if (val === null || val === 'all') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle>{props.title ?? 'Payments'}</CardTitle>
        <CardDescription>
          {props.description ??
            'Record payments against bills and track receipts.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-4 border-b pb-4">
          {/* Payment Status Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              Payment Status
            </span>
            <Select
              value={statusVal}
              onValueChange={(val) => updateFilters({ status: val })}
            >
              <SelectTrigger className="bg-background h-9 w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bill Type Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              Bill Type
            </span>
            <Select
              value={typeVal}
              onValueChange={(val) => updateFilters({ type: val })}
            >
              <SelectTrigger className="bg-background h-9 w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="electricity">Electricity</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="other_charges">Other Charges</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Duration Filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              Duration
            </span>
            <Select
              value={durationVal}
              onValueChange={(val) => updateFilters({ duration: val })}
            >
              <SelectTrigger className="bg-background h-9 w-[180px]">
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="current_month">Current Month</SelectItem>
                <SelectItem value="prev_month">Previous Month</SelectItem>
                <SelectItem value="last_3m">Last 3 Months</SelectItem>
                <SelectItem value="last_6m">Last 6 Months</SelectItem>
                <SelectItem value="this_fy">This Financial Year</SelectItem>
                <SelectItem value="prev_fy">Previous Financial Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {totalCount === 0 &&
        statusVal === 'all' &&
        typeVal === 'all' &&
        durationVal === 'all' ? (
          <p className="text-muted-foreground text-sm">No bills to show yet.</p>
        ) : (
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[1%]" />
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bills.map((bill) => {
                  const status = displayBillStatus(bill);
                  const outstanding = bill.total_amount - bill.paid_amount;

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="text-muted-foreground font-medium">
                        {formatPeriod(bill.period)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {bill.unit_no}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {bill.bill_no}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatINR(bill.total_amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {outstanding > 0 ? (
                          <span className="text-red-600">
                            {formatINR(outstanding)}
                          </span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            billStatusBadgeClassName(status),
                            'border-0 bg-transparent px-0 font-bold shadow-none',
                          )}
                        >
                          <span
                            className={cn(
                              'mr-2 inline-block h-2 w-2 rounded-full',
                              status === 'Paid'
                                ? 'bg-green-500'
                                : status === 'Overdue'
                                  ? 'bg-red-500'
                                  : status === 'Partial'
                                    ? 'bg-orange-500'
                                    : 'bg-yellow-500',
                            )}
                          ></span>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[1%] text-right whitespace-nowrap">
                        <BillPaymentsDialog
                          billId={bill.id}
                          billNo={bill.bill_no}
                          associationId={props.associationId}
                          payments={bill.payments}
                        />
                      </TableCell>

                      <TableCell className="w-[1%] text-right whitespace-nowrap">
                        {props.canManage && outstanding > 0 ? (
                          <RecordPaymentDialog
                            billId={bill.id}
                            billNo={bill.bill_no}
                            associationId={props.associationId}
                            outstanding={outstanding}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="bg-muted/10 mt-4 rounded-b-lg border-t px-4 py-3">
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
                    bills
                  </p>

                  <div className="flex items-center gap-1">
                    {page > 1 ? (
                      <Link
                        href={`${baseUrl}?${(() => {
                          const params = new URLSearchParams(
                            searchParams.toString(),
                          );
                          params.set('page', String(page - 1));
                          return params.toString();
                        })()}`}
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
                        href={`${baseUrl}?${(() => {
                          const params = new URLSearchParams(
                            searchParams.toString(),
                          );
                          params.set('page', String(page + 1));
                          return params.toString();
                        })()}`}
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
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
