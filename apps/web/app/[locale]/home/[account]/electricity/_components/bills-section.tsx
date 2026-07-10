'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';

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

import { TypeToConfirmDialog } from '../../_components/type-to-confirm-dialog';
import {
  createElectricityBillAction,
  deleteElectricityBillAction,
} from '../_lib/electricity-actions';
import { CreateElectricityBillSchema } from '../_lib/electricity-schema';
import { BillReadingsDialog } from './bill-readings-dialog';
import { ImportMeterReadingsDialog } from './import-meter-readings-dialog';
import type { SubMeterRow } from './sub-meters-section';

export interface ElectricityBillRow {
  id: string;
  period: string;
  invoice_amount: number;
  block_consumption_units: number;
  period_start: string | null;
  period_end: string | null;
}

const unitsFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function BillsSection(props: {
  associationId: string;
  bills: ElectricityBillRow[];
  activeSubMeters: SubMeterRow[];
  readingsByBill: Record<
    string,
    Record<
      string,
      {
        previous_reading: number;
        current_reading: number;
        minimum_charge: number;
      }
    >
  >;
  consumedByBill: Record<string, number>;
  lastReadingBeforePeriodByBill: Record<string, Record<string, number>>;
  lastMinChargeBeforePeriodByBill: Record<string, Record<string, number>>;
  canManage: boolean;
  isSuperAdmin?: boolean;
}) {
  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col space-y-1.5">
          <CardTitle>Electricity Bills</CardTitle>
          <CardDescription>
            Upload each month's electricity bill, then split it across meters
            using the readings you record.
          </CardDescription>
        </div>

        {props.canManage ? (
          <div className="flex shrink-0 items-center gap-2">
            <ImportMeterReadingsDialog associationId={props.associationId} />
            <AddBillDialog associationId={props.associationId} />
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {props.bills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Electricity bills uploaded yet.
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
                  <TableHead className="text-right">Unit Rate</TableHead>
                  {props.canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.bills.map((bill) => {
                  const metered = props.consumedByBill[bill.id] ?? 0;
                  const blockRate =
                    bill.block_consumption_units > 0
                      ? bill.invoice_amount / bill.block_consumption_units
                      : null;

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="text-muted-foreground font-medium">
                        {formatPeriod(bill.period)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatINR(bill.invoice_amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-medium tabular-nums">
                        {unitsFmt.format(bill.block_consumption_units)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {unitsFmt.format(metered)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-blue-600 tabular-nums">
                        {blockRate != null
                          ? `₹${blockRate.toFixed(2)}/unit`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {metered > 0
                          ? `₹${(bill.invoice_amount / metered).toFixed(2)}/unit`
                          : '—'}
                      </TableCell>
                      {props.canManage ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            <BillReadingsDialog
                              associationId={props.associationId}
                              electricityBillId={bill.id}
                              period={bill.period}
                              blockConsumptionUnits={
                                bill.block_consumption_units
                              }
                              activeSubMeters={props.activeSubMeters}
                              existingReadings={
                                props.readingsByBill[bill.id] ?? {}
                              }
                              lastKnownReadingBySubMeter={
                                props.lastReadingBeforePeriodByBill[bill.id] ??
                                {}
                              }
                              lastMinChargeBySubMeter={
                                props.lastMinChargeBeforePeriodByBill[
                                  bill.id
                                ] ?? {}
                              }
                            />
                            {props.isSuperAdmin && (
                              <DeleteElectricityBillButton
                                electricityBillId={bill.id}
                                period={bill.period}
                                associationId={props.associationId}
                              />
                            )}
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
          Block Rate = MESCOM invoice ÷ MESCOM block units. Unit Rate = MESCOM
          invoice ÷ total sub-metered consumption, which is the effective rate
          charged.
        </p>
      </CardContent>
    </Card>
  );
}

function AddBillDialog(props: { associationId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <DialogTitle>Add a Electricity bill</DialogTitle>
          <DialogDescription>
            Enter the amount and total consumption from this month's electricity
            bill.
          </DialogDescription>
        </DialogHeader>

        <AddBillForm
          associationId={props.associationId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function getPeriodOptions() {
  const options = [];
  const now = new Date();
  for (let i = -7; i <= -1; i++) {
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

function AddBillForm(props: { associationId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  const periodOptions = useMemo(() => getPeriodOptions(), []);

  function defaultDatesForPeriod(p: string) {
    const [y, m] = p.split('-').map(Number);
    const lastDay = new Date(y!, m!, 0).getDate();
    return {
      periodStart: `${p}-01`,
      periodEnd: `${p}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  const form = useForm({
    resolver: zodResolver(CreateElectricityBillSchema),
    defaultValues: {
      period: defaultPeriod,
      invoiceAmount: '',
      blockConsumptionUnits: '',
      ...defaultDatesForPeriod(defaultPeriod),
    },
  });

  const watchedPeriod = form.watch('period');

  useEffect(() => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(watchedPeriod)) {
      const { periodStart, periodEnd } = defaultDatesForPeriod(watchedPeriod);
      form.setValue('periodStart', periodStart);
      form.setValue('periodEnd', periodEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPeriod, form]);

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await createElectricityBillAction(
        props.associationId,
        values,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not add the bill.');
        return;
      }

      toast.success(`Bill for ${values.period} added.`);
      form.reset();
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
              <FormLabel>Billing Period</FormLabel>
              <Select
                items={periodOptions}
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a period" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {periodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Select the month for which electricity was consumed. One bill
                per calendar month.
              </FormDescription>
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
                The total units Electricity billed you for, from the invoice.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            name="periodStart"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period start</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="periodEnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period end</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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

function DeleteElectricityBillButton(props: {
  electricityBillId: string;
  period: string;
  associationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const result = await deleteElectricityBillAction(
        props.associationId,
        props.electricityBillId,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not delete the bill.');
        return;
      }

      toast.success(`Electricity bill for ${props.period} deleted.`);
      router.refresh();
    });
  };

  return (
    <TypeToConfirmDialog
      trigger={
        <Button size="sm" variant="destructive">
          Delete
        </Button>
      }
      title={`Delete ${formatPeriod(props.period)} bill?`}
      description="This permanently removes the Electricity bill and all its recorded meter readings. This action cannot be undone."
      confirmValue="DELETE"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
}
