'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@kit/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
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

import {
  generateBillsAction,
  type PendingOtherCharge,
} from '../_lib/billing-actions';
import { GenerateBillsSchema } from '../_lib/billing-schema';
import {
  BillLineItemsDialog,
  type BillLineItemRow,
} from './bill-line-items-dialog';
import { OtherChargesDialog } from './other-charges-dialog';
export interface BillRow {
  id: string;
  period: string;
  bill_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  unit_no: string;
  lineItems: BillLineItemRow[];
}

interface PendingChargeWithUnit extends PendingOtherCharge {
  unit_no?: string | null;
  period: string;
}

export function BillsSection(props: {
  associationId: string;
  bills: BillRow[];
  canManage: boolean;
  canDelete: boolean;
  units?: { id: string; unit_no: string }[];
  pendingCharges?: PendingChargeWithUnit[];
  periodOptions?: string[];
  isOtherChargesActive: boolean;
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
  const baseUrl = `/home/${props.accountSlug}/billing`;

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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col space-y-1.5">
          <CardTitle>Bills</CardTitle>
        </div>

        {props.canManage ? (
          <div className="flex items-center gap-2 sm:shrink-0">
            {props.isOtherChargesActive &&
              props.units &&
              props.periodOptions && (
                <OtherChargesDialog
                  associationId={props.associationId}
                  units={props.units}
                  pendingCharges={props.pendingCharges ?? []}
                  periods={props.periodOptions}
                />
              )}
            <GenerateBillsDialog associationId={props.associationId} />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5">
        {totalCount === 0 &&
        statusVal === 'all' &&
        typeVal === 'all' &&
        durationVal === 'all' ? (
          <p className="text-muted-foreground text-sm">
            No bills generated yet.
          </p>
        ) : (
          <>
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
                    <SelectItem value="prev_fy">
                      Previous Financial Year
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill No.</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Maintenance</TableHead>
                    <TableHead className="text-right">Electricity</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.bills.map((bill) => {
                    const status = displayBillStatus(bill);
                    const maintenanceLine = bill.lineItems.find((li) =>
                      li.description.toLowerCase().includes('maintenance'),
                    );
                    const electricityLine = bill.lineItems.find((li) =>
                      li.description.toLowerCase().includes('electricity'),
                    );

                    return (
                      <TableRow key={bill.id}>
                        <TableCell className="text-muted-foreground font-medium">
                          {bill.bill_no}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {bill.unit_no}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {maintenanceLine
                            ? formatINR(maintenanceLine.amount)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {electricityLine
                            ? formatINR(electricityLine.amount)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {formatINR(bill.total_amount)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatINR(bill.paid_amount)}
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
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <BillLineItemsDialog
                              billNo={bill.bill_no}
                              period={bill.period}
                              lineItems={bill.lineItems}
                            />

                            <DownloadPdfButton
                              href={`/api/billing/bills/${bill.id}/pdf`}
                              label="Download bill PDF"
                              dataTest={`download-bill-${bill.id}`}
                              showLabel
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="bg-muted/10 rounded-b-lg border-t px-4 py-3">
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
          </>
        )}

        <p className="text-muted-foreground mt-3 text-xs">
          Electricity line items use the simple invoice ÷ block-units rate from
          MESCOM Bills. Carry-forward reconciliation isn't built yet.
        </p>
      </CardContent>
    </Card>
  );
}

function GenerateBillsDialog(props: { associationId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" data-test="generate-bills-trigger">
            <Plus className="h-4 w-4" />
            Generate Bills
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate bills for a period</DialogTitle>
          <DialogDescription>
            Creates a bill for every unit for the selected period and bill type.
          </DialogDescription>
        </DialogHeader>

        <GenerateBillsForm
          associationId={props.associationId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function GenerateBillsForm(props: {
  associationId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Generate a list of periods: last 6 months to next 6 months
  const periodOptions = Array.from({ length: 13 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    };
  });

  const form = useForm({
    resolver: zodResolver(GenerateBillsSchema),
    defaultValues: { period: defaultPeriod, billType: 'All' },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await generateBillsAction(props.associationId, values);

      if (!result.success) {
        toast.error(result.error ?? 'Could not generate bills.');
        return;
      }

      toast.success(
        `${result.created ?? 0} bill(s) created${
          result.skipped ? `, ${result.skipped} already billed` : ''
        }.`,
      );
      props.onDone();
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          name="billType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bill Type</FormLabel>
              <FormControl>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Bill Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Bills</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                    <SelectItem value="Electricity">Electricity</SelectItem>
                    <SelectItem value="Other Charges">Other Charges</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="period"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Period</FormLabel>
              <FormControl>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                Units that already have a bill for this period are skipped.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button size="sm" className="self-start">
                Generate
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Generate Bills</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to generate bills for this period? Once
                generated, bills cannot be deleted or modified.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isPending}
                onClick={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
              >
                {isPending && <Spinner className="mr-2 h-4 w-4" />}
                Confirm Generation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    </Form>
  );
}
