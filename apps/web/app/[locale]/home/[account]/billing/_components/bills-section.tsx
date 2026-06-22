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

import { formatINR } from '~/lib/format-inr';

import { deleteBillAction, generateBillsAction } from '../_lib/billing-actions';
import { GenerateBillsSchema } from '../_lib/billing-schema';
import {
  BillLineItemsDialog,
  type BillLineItemRow,
} from './bill-line-items-dialog';

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

function displayStatus(bill: BillRow): string {
  if (
    bill.status === 'Unpaid' &&
    bill.due_date < new Date().toISOString().slice(0, 10)
  ) {
    return 'Overdue';
  }

  return bill.status;
}

function statusVariant(
  status: string,
): 'secondary' | 'outline' | 'destructive' | 'default' {
  switch (status) {
    case 'Paid':
      return 'secondary';
    case 'Overdue':
      return 'destructive';
    case 'Partial':
      return 'default';
    default:
      return 'outline';
  }
}

export function BillsSection(props: {
  associationId: string;
  bills: BillRow[];
  canManage: boolean;
  canDelete: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex flex-col space-y-1.5">
          <CardTitle>Bills</CardTitle>
          <CardDescription>
            Generate bills for a period from your active charge types, then
            track what's outstanding.
          </CardDescription>
        </div>

        {props.canManage ? (
          <GenerateBillsDialog associationId={props.associationId} />
        ) : null}
      </CardHeader>

      <CardContent>
        {props.bills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No bills generated yet.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill No.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bills.map((bill) => {
                  const status = displayStatus(bill);

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">
                        {bill.period}
                      </TableCell>
                      <TableCell>{bill.unit_no}</TableCell>
                      <TableCell>{bill.bill_no}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(bill.total_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(bill.paid_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(status)}>{status}</Badge>
                      </TableCell>
                      <TableCell>{bill.due_date}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <BillLineItemsDialog
                            billNo={bill.bill_no}
                            period={bill.period}
                            lineItems={bill.lineItems}
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
        )}

        <p className="text-muted-foreground mt-3 text-xs">
          Electricity line items use the simple invoice ÷ block-units rate from
          MESCOM Bills — carry-forward reconciliation isn't built yet.
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
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteBillAction(props.billId, props.associationId);

      if (!result.success) {
        toast.error(result.error ?? 'Could not delete the bill.');
        return;
      }

      toast.success(`Bill ${props.billNo} deleted.`);
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="destructive">
            Void
          </Button>
        }
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void bill {props.billNo}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the bill and its line items. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={onDelete}>
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Void
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
