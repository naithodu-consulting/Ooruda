'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
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
  FormField,
  FormItem,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { formatPeriod } from '~/lib/format-period';

import { recordMeterReadingsAction } from '../_lib/electricity-actions';
import { RecordMeterReadingsSchema } from '../_lib/electricity-schema';
import type { SubMeterRow } from './sub-meters-section';

const unitsFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function BillReadingsDialog(props: {
  associationId: string;
  electricityBillId: string;
  period: string;
  blockConsumptionUnits: number;
  activeSubMeters: SubMeterRow[];
  existingReadings: Record<
    string,
    {
      previous_reading: number;
      current_reading: number;
      minimum_charge: number;
    }
  >;
  lastKnownReadingBySubMeter: Record<string, number>;
  lastMinChargeBySubMeter: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            data-test="enter-readings-trigger"
          >
            Enter Readings
          </Button>
        }
      />

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Meter readings · {formatPeriod(props.period)}
          </DialogTitle>
          <DialogDescription>
            Enter this month&apos;s closing reading for each meter. Consumption
            is calculated automatically and used to split the bill.
          </DialogDescription>
        </DialogHeader>

        {props.activeSubMeters.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No active sub-meters yet. Add one before recording readings.
          </p>
        ) : (
          <ReadingsForm
            associationId={props.associationId}
            electricityBillId={props.electricityBillId}
            blockConsumptionUnits={props.blockConsumptionUnits}
            activeSubMeters={props.activeSubMeters}
            existingReadings={props.existingReadings}
            lastKnownReadingBySubMeter={props.lastKnownReadingBySubMeter}
            lastMinChargeBySubMeter={props.lastMinChargeBySubMeter}
            onSaved={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadingsForm(props: {
  associationId: string;
  electricityBillId: string;
  blockConsumptionUnits: number;
  activeSubMeters: SubMeterRow[];
  existingReadings: Record<
    string,
    {
      previous_reading: number;
      current_reading: number;
      minimum_charge: number;
    }
  >;
  lastKnownReadingBySubMeter: Record<string, number>;
  lastMinChargeBySubMeter: Record<string, number>;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(RecordMeterReadingsSchema),
    defaultValues: {
      electricityBillId: props.electricityBillId,
      readings: props.activeSubMeters.map((meter) => {
        const existing = props.existingReadings[meter.id];

        return {
          subMeterId: meter.id,
          previousReading:
            existing?.previous_reading ??
            props.lastKnownReadingBySubMeter[meter.id] ??
            0,
          currentReading: existing?.current_reading ?? 0,
          // Pre-fill from this bill's saved value, then fall back to the most
          // recent minimum charge recorded for this sub-meter in a prior period.
          minimumCharge:
            existing?.minimum_charge ??
            props.lastMinChargeBySubMeter[meter.id] ??
            0,
        };
      }),
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: 'readings' });

  // Watch the array so per-row consumption and the running total stay live as
  // the user types.
  const watched = useWatch({ control: form.control, name: 'readings' });

  // Readings are decimals, so every total is rounded to 2dp at source and that
  // one value drives the comparison, the running total and the overage alike.
  // Comparing the raw float while displaying a rounded one produced a banner
  // reading "250 / 250 units - exceeds by 0 units" on pure float drift.
  const roundUnits = (n: number) => Math.round(n * 100) / 100;

  const totalConsumption = roundUnits(
    (watched ?? []).reduce((sum, row) => {
      const prev = Number(row?.previousReading) || 0;
      const curr = Number(row?.currentReading) || 0;

      return sum + Math.max(0, curr - prev);
    }, 0),
  );

  const totalMinCharge = roundUnits(
    (watched ?? []).reduce((sum, row) => {
      return sum + (Number(row?.minimumCharge) || 0);
    }, 0),
  );

  // Sub-meters can never exceed the main Electricity block meter. If they do, the
  // readings are wrong and any bill split would overcharge residents.
  const exceedsBlock = totalConsumption > props.blockConsumptionUnits;
  const overageUnits = roundUnits(
    totalConsumption - props.blockConsumptionUnits,
  );

  // Per-row guard: a current reading below the previous one is never valid (it
  // means a mis-keyed value or a replaced meter). Saving would drop the meter
  // out of the split, so the whole form is blocked until every row is sane -
  // the row-level counterpart to the block-total check above.
  const invalidRowLabels = (watched ?? []).flatMap((row, index) => {
    const prev = Number(row?.previousReading) || 0;
    const curr = Number(row?.currentReading) || 0;

    // Rounded, so a row the UI renders as 0 consumption is never flagged.
    return roundUnits(curr - prev) < 0
      ? [props.activeSubMeters[index]?.meter_label ?? `Row ${index + 1}`]
      : [];
  });

  const hasInvalidRows = invalidRowLabels.length > 0;

  const onSubmit = form.handleSubmit((values) => {
    if (hasInvalidRows) {
      toast.error(
        `${invalidRowLabels.length} meter${invalidRowLabels.length === 1 ? ' has' : 's have'} a current reading below the previous reading: ${invalidRowLabels.join(', ')}. Correct them before saving.`,
        { duration: 6000 },
      );

      return;
    }

    if (exceedsBlock) {
      // Surface as a form-level error so the user can't accidentally save bad data.
      toast.error(
        `Total metered (${unitsFmt.format(totalConsumption)} units) exceeds the block consumption (${unitsFmt.format(props.blockConsumptionUnits)} units). Correct the readings before saving.`,
        { duration: 6000 },
      );

      return;
    }

    startTransition(async () => {
      const result = await recordMeterReadingsAction(
        props.associationId,
        values,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not save the readings.');
        return;
      }

      toast.success('Readings saved.');
      props.onSaved();
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border">
          {/* Column headers */}
          <div className="bg-muted/50 text-muted-foreground hidden grid-cols-[minmax(0,1fr)_6.75rem_1rem_6.75rem_5.5rem_6.5rem] items-center gap-x-2 border-b px-3 py-2 text-xs font-medium sm:grid">
            <span>Meter</span>
            <span className="text-center">Previous</span>
            <span />
            <span className="text-center">Current</span>
            <span className="text-right">Consumption</span>
            <span className="text-right">Min. Charge (₹)</span>
          </div>

          <div className="divide-y">
            {fields.map((field, index) => {
              const meter = props.activeSubMeters[index];
              const prev = Number(watched?.[index]?.previousReading) || 0;
              const curr = Number(watched?.[index]?.currentReading) || 0;
              const consumption = roundUnits(curr - prev);

              const rowErrors = form.formState.errors.readings?.[index];
              const errorMessage =
                rowErrors?.currentReading?.message ??
                rowErrors?.previousReading?.message;

              return (
                <div key={field.id} className="px-3 py-2.5">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6.75rem_1rem_6.75rem_5.5rem_6.5rem] sm:items-center sm:gap-x-2">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate text-sm font-medium">
                        {meter?.meter_label}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {meter?.meter_type === 'CommonArea'
                          ? 'Common area'
                          : `Unit ${meter?.unit_no}`}
                      </p>
                    </div>

                    <input
                      type="hidden"
                      {...form.register(`readings.${index}.subMeterId`)}
                    />

                    <FormField
                      name={`readings.${index}.previousReading`}
                      render={({ field: f }) => (
                        <FormItem className="gap-y-1">
                          {/* On mobile the two inputs sit side by side with no
                              arrow between them, so label them. Hidden from
                              sm: up, where the column headers do this job. */}
                          <span className="text-muted-foreground text-xs sm:hidden">
                            Previous
                          </span>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              aria-label={`${meter?.meter_label} previous reading`}
                              className="bg-muted/40 h-9 [appearance:textfield] px-1.5 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              onFocus={(e) => e.currentTarget.select()}
                              {...f}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <ArrowRight className="text-muted-foreground mx-auto hidden h-3.5 w-3.5 sm:block" />

                    <FormField
                      name={`readings.${index}.currentReading`}
                      render={({ field: f }) => (
                        <FormItem className="gap-y-1">
                          <span className="text-foreground text-xs font-medium sm:hidden">
                            Current
                          </span>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              aria-label={`${meter?.meter_label} current reading`}
                              className="h-9 [appearance:textfield] px-1.5 text-center font-medium tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              onFocus={(e) => e.currentTarget.select()}
                              {...f}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="col-span-2 flex items-center justify-between text-sm tabular-nums sm:col-span-1 sm:block sm:text-right">
                      <span className="text-muted-foreground sm:hidden">
                        Consumption
                      </span>
                      {consumption < 0 ? (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 text-destructive"
                        >
                          Invalid
                        </Badge>
                      ) : (
                        <span className="font-semibold">
                          {unitsFmt.format(consumption)}
                        </span>
                      )}
                    </div>

                    <FormField
                      name={`readings.${index}.minimumCharge`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-2 sm:col-span-1">
                          <div className="flex items-center justify-between sm:block">
                            <span className="text-muted-foreground text-sm sm:hidden">
                              Min. Charge (₹)
                            </span>
                            <FormControl>
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                placeholder="0"
                                aria-label={`${meter?.meter_label} minimum charge`}
                                className="h-9 w-28 [appearance:textfield] px-1.5 text-right tabular-nums sm:w-full [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                onFocus={(e) => e.currentTarget.select()}
                                {...f}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {errorMessage ? (
                    <p className="text-destructive mt-1.5 text-xs">
                      {errorMessage}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Running totals row */}
          <div
            className={`flex flex-col gap-1 border-t px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${exceedsBlock ? 'bg-destructive/5' : 'bg-muted/50'}`}
          >
            <span className="text-sm font-medium">Total metered</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span
                className={`text-sm font-semibold tabular-nums ${exceedsBlock ? 'text-destructive' : ''}`}
              >
                {unitsFmt.format(totalConsumption)} /{' '}
                {unitsFmt.format(props.blockConsumptionUnits)} units
              </span>
              {totalMinCharge > 0 && (
                <span className="text-muted-foreground text-sm tabular-nums">
                  Min. charges: ₹{unitsFmt.format(totalMinCharge)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inline error banner - shown live as the user types */}
        {hasInvalidRows ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>
                {invalidRowLabels.length} meter
                {invalidRowLabels.length === 1 ? '' : 's'}
              </strong>{' '}
              {invalidRowLabels.length === 1 ? 'has a' : 'have a'} current
              reading below the previous reading:{' '}
              <strong>{invalidRowLabels.join(', ')}</strong>. Readings cannot be
              saved until every meter is corrected.
            </AlertDescription>
          </Alert>
        ) : null}

        {exceedsBlock ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Sub-meter total exceeds the block consumption by{' '}
              <strong>{unitsFmt.format(overageUnits)} units</strong>. Sub-meters
              cannot consume more than the main Electricity meter. Please
              correct the readings before saving.
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-muted-foreground text-xs">
          Previous readings carry over from last month&apos;s closing values.
          Adjust them only to correct an error.
        </p>

        <Button
          type="submit"
          disabled={isPending || exceedsBlock || hasInvalidRows}
          className="w-full"
          data-test="save-readings-button"
        >
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Save Readings
        </Button>
      </form>
    </Form>
  );
}
