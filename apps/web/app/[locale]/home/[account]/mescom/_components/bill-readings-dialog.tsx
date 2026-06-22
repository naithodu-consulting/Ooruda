'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { recordMeterReadingsAction } from '../_lib/mescom-actions';
import { RecordMeterReadingsSchema } from '../_lib/mescom-schema';
import type { SubMeterRow } from './sub-meters-section';

export function BillReadingsDialog(props: {
  associationId: string;
  mescomBillId: string;
  period: string;
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

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Meter readings — {props.period}</DialogTitle>
          <DialogDescription>
            Enter the previous and current reading for each active meter.
          </DialogDescription>
        </DialogHeader>

        {props.activeSubMeters.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active sub-meters yet. Add one first.
          </p>
        ) : (
          <ReadingsForm
            associationId={props.associationId}
            mescomBillId={props.mescomBillId}
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

  const onSubmit = form.handleSubmit((values) => {
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
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-3 items-end gap-2">
              <span className="text-sm font-medium">
                {props.activeSubMeters[index]?.meter_label}
              </span>

              <input
                type="hidden"
                {...form.register(`readings.${index}.subMeterId`)}
              />

              <FormField
                name={`readings.${index}.previousReading`}
                render={({ field: f }) => (
                  <FormItem>
                    <Input type="number" step="0.01" min="0" {...f} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name={`readings.${index}.currentReading`}
                render={({ field: f }) => (
                  <FormItem>
                    <Input type="number" step="0.01" min="0" {...f} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}
        </div>

        <Button
          type="submit"
          disabled={isPending}
          size="sm"
          className="self-start"
        >
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Save Readings
        </Button>
      </form>
    </Form>
  );
}
