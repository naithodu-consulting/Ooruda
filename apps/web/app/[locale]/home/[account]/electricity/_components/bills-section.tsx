'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { DatePicker } from '@kit/ui/date-picker';
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
import { SearchableSelect } from '@kit/ui/searchable-select';
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
          <div className="w-full overflow-x-auto">
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
          <DialogTitle>Add Electricity Bill</DialogTitle>
          <DialogDescription>
            Enter the amount and consumption from the MESCOM bill. Select the{' '}
            <strong>billing month</strong> i.e. the month you are collecting
            payment (not the meter reading month).
          </DialogDescription>
        </DialogHeader>

        <AddBillForm
          associationId={props.associationId}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function getPeriodOptions() {
  const options = [];
  const now = new Date();
  // Include the current month (i = 0) because the operator uploads the MESCOM
  // bill in the same month they collect payment (billing month semantics).
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

function AddBillForm(props: { associationId: string; onSuccess: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const now = new Date();
  // Default to the current month — the operator uploads the MESCOM bill in the
  // same month they are collecting payment (billing month = current month).
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const periodOptions = useMemo(() => getPeriodOptions(), []);

  // Reading period = the month *before* the billing period.
  // e.g., billing month July → reading dates are Jun 01 – Jun 30.
  function defaultDatesForPeriod(billingPeriod: string) {
    const [y, m] = billingPeriod.split('-').map(Number) as [number, number];
    const readingMonthFirst = new Date(Date.UTC(y, m - 2, 1)); // m-2: month before billing month, 0-indexed
    const readingMonthLast = new Date(Date.UTC(y, m - 1, 0)); // last day of reading month
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return {
      periodStart: fmt(readingMonthFirst),
      periodEnd: fmt(readingMonthLast),
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

  const watchedPeriod = useWatch({ control: form.control, name: 'period' });

  useEffect(() => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(watchedPeriod)) {
      const { periodStart, periodEnd } = defaultDatesForPeriod(watchedPeriod);
      form.setValue('periodStart', periodStart);
      form.setValue('periodEnd', periodEnd);
    }
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

      toast.success(`Bill for ${formatPeriod(values.period)} added.`);
      form.reset();
      props.onSuccess();
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
              <FormLabel>Billing Month</FormLabel>
              <FormControl>
                <SearchableSelect
                  items={periodOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="Select a month"
                  searchPlaceholder="Search months…"
                  emptyMessage="No months found"
                  data-test="electricity-bill-period"
                />
              </FormControl>
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
                The total Electricity units billed, from the invoice.
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
                <FormLabel>Reading Start Date</FormLabel>
                <FormControl>
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="periodEnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reading End Date</FormLabel>
                <FormControl>
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
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

      toast.success(
        `Electricity bill for ${formatPeriod(props.period)} deleted.`,
      );
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
