'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
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
import { Input } from '@kit/ui/input';
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
  deleteBillAction,
  generateBillsAction,
  type PendingOtherCharge,
} from '../_lib/billing-actions';
import { GenerateBillsSchema } from '../_lib/billing-schema';
import {
  BillLineItemsDialog,
  type BillLineItemRow,
} from './bill-line-items-dialog';
import { OtherChargesDialog } from './other-charges-dialog';

type BillFilter = 'all' | 'unpaid' | 'paid' | 'partial' | 'overdue';

const FILTERS: { id: BillFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'paid', label: 'Paid' },
  { id: 'partial', label: 'Partial' },
  { id: 'overdue', label: 'Overdue' },
];

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
}) {
  const [filter, setFilter] = useState<BillFilter>('all');

  const filteredBills = props.bills.filter((bill) => {
    const status = displayBillStatus(bill);

    switch (filter) {
      case 'unpaid':
        return status === 'Unpaid';
      case 'paid':
        return status === 'Paid';
      case 'partial':
        return status === 'Partial';
      case 'overdue':
        return status === 'Overdue';
      default:
        return true;
    }
  });

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col space-y-1.5">
          <CardTitle>Bills</CardTitle>
          <CardDescription>
            Generate bills for a period from your active charge types, then
            track what's outstanding.
          </CardDescription>
        </div>

        {props.canManage ? (
          <div className="flex items-center gap-2 sm:shrink-0">
            {props.units && props.periodOptions && (
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
        {props.bills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No bills generated yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                    filter === f.id
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5',
                  )}
                >
                  {f.label}
                </button>
              ))}
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
                  {filteredBills.map((bill) => {
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
                        <TableCell className="text-right tabular-nums">
                          {maintenanceLine
                            ? formatINR(maintenanceLine.amount)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {electricityLine
                            ? formatINR(electricityLine.amount)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {formatINR(bill.total_amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right font-medium tabular-nums">
                          {bill.paid_amount > 0 ? (
                            <span className="text-green-600">
                              {formatINR(bill.paid_amount)}
                            </span>
                          ) : (
                            '0'
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

                            {props.canDelete ? (
                              <DeleteBillButton
                                billId={bill.id}
                                billNo={bill.bill_no}
                                associationId={props.associationId}
                              />
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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
            Creates a bill for every unit that doesn't already have one for this
            period, from your active charge types.
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

  const form = useForm({
    resolver: zodResolver(GenerateBillsSchema),
    defaultValues: { period: defaultPeriod },
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
          name="period"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Period</FormLabel>
              <FormControl>
                <Input placeholder="YYYY-MM, e.g. 2026-06" {...field} />
              </FormControl>
              <FormDescription>
                Units that already have a bill for this period are skipped.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isPending}
          size="sm"
          className="self-start"
        >
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Generate
        </Button>
      </form>
    </Form>
  );
}

function DeleteBillButton(props: {
  billId: string;
  billNo: string;
  associationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteBillAction(props.billId, props.associationId);

      if (!result.success) {
        toast.error(result.error ?? 'Could not delete the bill.');
        return;
      }

      toast.success(`Bill ${props.billNo} deleted.`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="destructive">
            Delete
          </Button>
        }
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete bill {props.billNo}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the bill and its line items. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              onDelete();
            }}
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
