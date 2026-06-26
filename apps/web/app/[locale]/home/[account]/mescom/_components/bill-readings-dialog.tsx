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
import { Form, FormControl, FormField, FormItem } from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { formatPeriod } from '~/lib/format-period';

import { recordMeterReadingsAction } from '../_lib/mescom-actions';
import { RecordMeterReadingsSchema } from '../_lib/mescom-schema';
import type { SubMeterRow } from './sub-meters-section';

const unitsFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function BillReadingsDialog(props: {
  associationId: string;
  mescomBillId: string;
  period: string;
  blockConsumptionUnits: number;
  activeSubMeters: SubMeterRow[];
  existingReadings: Record<
    string,
    { previous_reading: number; current_reading: number }
  >;
  lastKnownReadingBySubMeter: Record<string, number>;
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

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Meter readings · {formatPeriod(props.period)}</DialogTitle>
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
            mescomBillId={props.mescomBillId}
            blockConsumptionUnits={props.blockConsumptionUnits}
            activeSubMeters={props.activeSubMeters}
            existingReadings={props.existingReadings}
            lastKnownReadingBySubMeter={props.lastKnownReadingBySubMeter}
            onSaved={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadingsForm(props: {
  associationId: string;
  mescomBillId: string;
  blockConsumptionUnits: number;
  activeSubMeters: SubMeterRow[];
  existingReadings: Record<
    string,
    { previous_reading: number; current_reading: number }
  >;
  lastKnownReadingBySubMeter: Record<string, number>;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(RecordMeterReadingsSchema),
    defaultValues: {
      mescomBillId: props.mescomBillId,
      readings: props.activeSubMeters.map((meter) => {
        const existing = props.existingReadings[meter.id];

        return {
          subMeterId: meter.id,
          previousReading:
            existing?.previous_reading ??
            props.lastKnownReadingBySubMeter[meter.id] ??
            0,
          currentReading: existing?.current_reading ?? 0,
        };
      }),
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: 'readings' });

  // Watch the array so per-row consumption and the running total stay live as
  // the user types.
  const watched = useWatch({ control: form.control, name: 'readings' });

  const totalConsumption = (watched ?? []).reduce((sum, row) => {
    const prev = Number(row?.previousReading) || 0;
    const curr = Number(row?.currentReading) || 0;

    return sum + Math.max(0, curr - prev);
  }, 0);

  // Sub-meters can never exceed the main MESCOM block meter. If they do, the
  // readings are wrong and any bill split would overcharge residents.
  const exceedsBlock = totalConsumption > props.blockConsumptionUnits;
  const overageUnits = totalConsumption - props.blockConsumptionUnits;

  const onSubmit = form.handleSubmit((values) => {
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
          <div className="bg-muted/50 text-muted-foreground grid grid-cols-[minmax(0,1fr)_5rem_1rem_5rem_5.5rem] items-center gap-x-2 border-b px-3 py-2 text-xs font-medium">
            <span>Meter</span>
            <span className="text-center">Previous</span>
            <span />
            <span className="text-center">Current</span>
            <span className="text-right">Consumption</span>
          </div>

          <div className="divide-y">
            {fields.map((field, index) => {
              const meter = props.activeSubMeters[index];
              const prev = Number(watched?.[index]?.previousReading) || 0;
              const curr = Number(watched?.[index]?.currentReading) || 0;
              const consumption = curr - prev;

              const rowErrors = form.formState.errors.readings?.[index];
              const errorMessage =
                rowErrors?.currentReading?.message ??
                rowErrors?.previousReading?.message;

              return (
                <div key={field.id} className="px-3 py-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem_1rem_5rem_5.5rem] items-center gap-x-2">
                    <div className="min-w-0">
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
                        <FormItem>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              aria-label={`${meter?.meter_label} previous reading`}
                              className="bg-muted/40 h-9 text-center tabular-nums"
                              onFocus={(e) => e.currentTarget.select()}
                              {...f}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <ArrowRight className="text-muted-foreground mx-auto h-3.5 w-3.5" />

                    <FormField
                      name={`readings.${index}.currentReading`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              aria-label={`${meter?.meter_label} current reading`}
                              className="h-9 text-center font-medium tabular-nums"
                              onFocus={(e) => e.currentTarget.select()}
                              {...f}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="text-right text-sm tabular-nums">
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

          {/* Running total row — turns red when it exceeds block consumption */}
          <div
            className={`flex items-center justify-between border-t px-3 py-2.5 ${exceedsBlock ? 'bg-destructive/5' : 'bg-muted/50'}`}
          >
            <span className="text-sm font-medium">Total metered</span>
            <span
              className={`text-sm font-semibold tabular-nums ${exceedsBlock ? 'text-destructive' : ''}`}
            >
              {unitsFmt.format(totalConsumption)} /{' '}
              {unitsFmt.format(props.blockConsumptionUnits)} units
            </span>
          </div>
        </div>

        {/* Inline error banner — shown live as the user types */}
        {exceedsBlock ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Sub-meter total exceeds the block consumption by{' '}
              <strong>{unitsFmt.format(overageUnits)} units</strong>. This is
              physically impossible — sub-meters cannot consume more than the
              main MESCOM meter. Correct the readings before saving.
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-muted-foreground text-xs">
          Previous readings carry over from last month&apos;s closing values.
          Adjust them only to correct an error.
        </p>

        <Button
          type="submit"
          disabled={isPending || exceedsBlock}
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
