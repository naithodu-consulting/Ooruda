'use client';

import { useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
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
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
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

import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

import { createMescomBillAction, deleteMescomBillAction } from '../_lib/mescom-actions';
import { CreateMescomBillSchema } from '../_lib/mescom-schema';
import { BillReadingsDialog } from './bill-readings-dialog';
import type { SubMeterRow } from './sub-meters-section';

export interface MescomBillRow {
  id: string;
  period: string;
  invoice_amount: number;
  block_consumption_units: number;
}

const unitsFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function BillsSection(props: {
  associationId: string;
  bills: MescomBillRow[];
  activeSubMeters: SubMeterRow[];
  readingsByBill: Record<
    string,
    Record<string, { previous_reading: number; current_reading: number }>
  >;
  consumedByBill: Record<string, number>;
  lastReadingBeforePeriodByBill: Record<string, Record<string, number>>;
  canManage: boolean;
}) {
  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex flex-col space-y-1.5">
          <CardTitle>MESCOM Bills</CardTitle>
          <CardDescription>
            Upload each month's electricity bill, then split it across meters
            using the readings you record.
          </CardDescription>
        </div>

        {props.canManage ? (
          <AddBillDialog associationId={props.associationId} />
        ) : null}
      </CardHeader>

      <CardContent>
        {props.bills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No MESCOM bills uploaded yet.
          </p>
        ) : (
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Invoice Amount</TableHead>
                  <TableHead className="text-right">Block Units</TableHead>
                  <TableHead className="text-right">Metered Units</TableHead>
                  <TableHead className="text-right">Block Rate</TableHead>
                  {props.canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bills.map((bill) => {
                  const metered = props.consumedByBill[bill.id] ?? 0;
                  const blockRate =
                    bill.invoice_amount / bill.block_consumption_units;

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {formatPeriod(bill.period)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatINR(bill.invoice_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-muted-foreground">
                        {unitsFmt.format(bill.block_consumption_units)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {unitsFmt.format(metered)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-blue-600">
                        ₹{blockRate.toFixed(2)}/unit
                      </TableCell>
                      {props.canManage ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <BillReadingsDialog
                              associationId={props.associationId}
                              mescomBillId={bill.id}
                              period={bill.period}
                              blockConsumptionUnits={bill.block_consumption_units}
                              activeSubMeters={props.activeSubMeters}
                              existingReadings={
                                props.readingsByBill[bill.id] ?? {}
                              }
                              lastKnownReadingBySubMeter={
                                props.lastReadingBeforePeriodByBill[bill.id] ?? {}
                              }
                            />
                            <DeleteMescomBillButton
                              mescomBillId={bill.id}
                              period={bill.period}
                              associationId={props.associationId}
                            />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-muted-foreground mt-3 text-xs">
          Block rate is the simple invoice ÷ block-units rate. Carry-forward
          reconciliation across periods isn't built yet. This is provisional
          until billing runs are in place.
        </p>
      </CardContent>
    </Card>
  );
}

function AddBillDialog(props: { associationId: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" data-test="add-mescom-bill-trigger">
            <Plus className="h-4 w-4" />
            Add Bill
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a MESCOM bill</DialogTitle>
          <DialogDescription>
            Enter the amount and total consumption from this month's electricity
            bill.
          </DialogDescription>
        </DialogHeader>

        <AddBillForm associationId={props.associationId} />
      </DialogContent>
    </Dialog>
  );
}

function getPeriodOptions() {
  const options = [];
  const now = new Date();
  for (let i = -6; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    options.push({ value, label });
  }
  return options;
}

function AddBillForm(props: { associationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const form = useForm({
    resolver: zodResolver(CreateMescomBillSchema),
    defaultValues: {
      period: defaultPeriod,
      invoiceAmount: '',
      blockConsumptionUnits: '',
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await createMescomBillAction(props.associationId, values);

      if (!result.success) {
        toast.error(result.error ?? 'Could not add the bill.');
        return;
      }

      toast.success(`Bill for ${values.period} added.`);
      form.reset();
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a period" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {getPeriodOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>One bill per calendar month.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="invoiceAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invoice amount (₹)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="blockConsumptionUnits"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Block consumption (units)</FormLabel>
              <FormControl>
                <Input type="number" step="1" min="1" {...field} />
              </FormControl>
              <FormDescription>
                The total units MESCOM billed you for, from the invoice.
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
          Add Bill
        </Button>
      </form>
    </Form>
  );
}

function DeleteMescomBillButton(props: {
  mescomBillId: string;
  period: string;
  associationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteMescomBillAction(
        props.associationId,
        props.mescomBillId,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not delete the bill.');
        return;
      }

      toast.success(`MESCOM bill for ${props.period} deleted.`);
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="destructive">
            Delete
          </Button>
        }
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete bill for {props.period}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the bill and its recorded meter readings. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            disabled={isPending}
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
