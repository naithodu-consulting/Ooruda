'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import { DatePicker } from '@kit/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
import { Textarea } from '@kit/ui/textarea';

import { todayInBillingZone } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { addDays } from '~/lib/villa-db/dates';
import { OPERATOR_BLOCK_REASONS } from '~/lib/villa/constants';
import { blockReasonLabel } from '~/lib/villa/labels';

import {
  type CreateBlockInput,
  CreateBlockSchema,
} from '../_lib/schemas/blocks.schema';
import { createBlockAction } from '../_lib/server/blocks-actions';

export function BlockDatesDialog(props: {
  accountId: string;
  propertyId: string;
  /** Nights past this date are already closed for sale: nothing to block. */
  bookingCutoffDate?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        data-test={'villa-block-new'}
      >
        <Ban className="mr-1.5 h-4 w-4" />
        Block dates
      </Button>

      {open ? (
        <BlockDatesForm {...props} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function BlockDatesForm(props: {
  accountId: string;
  propertyId: string;
  bookingCutoffDate?: string | null;
  onClose: () => void;
}) {
  const today = todayInBillingZone();
  const cutoff = props.bookingCutoffDate ?? undefined;

  const form = useForm<CreateBlockInput>({
    resolver: zodResolver(CreateBlockSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      checkIn: '',
      checkOut: '',
      reason: 'maintenance',
      notes: '',
    },
  });

  const [checkIn] = useWatch({
    control: form.control,
    name: ['checkIn'],
  });

  const { execute, isPending } = useAction(createBlockAction, {
    onSuccess: () => {
      toast.success('Dates blocked');
      props.onClose();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not block those dates.'),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] max-w-lg overflow-y-auto"
        data-test={'villa-block-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Block dates</DialogTitle>
          <DialogDescription>
            Prevents bookings on these nights.
            {cutoff
              ? ` Cutoff date is ${formatDateReadable(cutoff)}, after which, property is closed for bookings.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => execute(values))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="checkIn"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                          const out = form.getValues('checkOut');
                          if (value && (!out || out <= value)) {
                            form.setValue('checkOut', addDays(value, 1), {
                              shouldValidate: true,
                            });
                          }
                        }}
                        onBlur={field.onBlur}
                        min={today}
                        max={cutoff}
                        data-test={'villa-block-checkin'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="checkOut"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        min={checkIn ? addDays(checkIn, 1) : addDays(today, 1)}
                        max={cutoff ? addDays(cutoff, 1) : undefined}
                        data-test={'villa-block-checkout'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              name="reason"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger
                        className="w-full"
                        data-test={'villa-block-reason'}
                      >
                        <SelectValue>
                          {(v: string) => blockReasonLabel(v)}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {OPERATOR_BLOCK_REASONS.map((r) => (
                        <SelectItem
                          key={r}
                          value={r}
                          data-test={`villa-block-reason-${r}`}
                        >
                          {blockReasonLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="notes"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl
                    render={
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="e.g. Pool resurfacing"
                        data-test={'villa-block-notes'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Not DialogFooter: its bg-muted band clashes with the dialog. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                data-test={'villa-block-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-test={'villa-block-submit'}
              >
                {isPending ? 'Blocking…' : 'Block dates'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
