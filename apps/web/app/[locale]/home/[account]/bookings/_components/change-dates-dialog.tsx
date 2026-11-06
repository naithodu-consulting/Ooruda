'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import { nightsBetween } from '~/lib/villa/booking-dates';

import { ChangeBookingDatesSchema } from '../_lib/schemas/bookings.schema';
import { changeBookingDatesAction } from '../_lib/server/bookings-actions';

/**
 * Moving a confirmed booking to different nights.
 *
 * Only the span is collected. The amounts are deliberately NOT shown as
 * editable and not sent: the server re-prices the stay from the rate card,
 * because different nights can carry a different rate and a form that could
 * post a price could sell a weekend at a weekday rate. The dialog says so,
 * so the figure changing afterwards is not a surprise.
 */
export function ChangeDatesDialog(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  bookingCode: string;
  checkIn: string;
  checkOut: string;
  siteUpdatedAt: string;
}) {
  const [open, setOpen] = useState(false);

  const defaults = {
    accountId: props.accountId,
    propertyId: props.propertyId,
    bookingId: props.bookingId,
    siteUpdatedAt: props.siteUpdatedAt,
    checkIn: props.checkIn,
    checkOut: props.checkOut,
    ignoreCutoff: false,
    reason: '',
  };

  const form = useForm({
    resolver: zodResolver(ChangeBookingDatesSchema),
    defaultValues: defaults,
  });

  const checkIn = useWatch({ control: form.control, name: 'checkIn' });
  const checkOut = useWatch({ control: form.control, name: 'checkOut' });
  const nights = nightsBetween(checkIn, checkOut);
  const unchanged = checkIn === props.checkIn && checkOut === props.checkOut;

  const { execute, isPending } = useAction(changeBookingDatesAction, {
    onSuccess: ({ data }) => {
      if (data && !data.auditWritten) {
        toast.warning(
          'Dates changed, but the change could not be written to the booking history. Note the reason elsewhere and tell whoever runs the site.',
          { duration: 12_000 },
        );
      } else {
        toast.success('Dates changed. The stay has been re-priced.');
      }

      setOpen(false);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not change the dates.'),
  });

  function onOpenChange(next: boolean) {
    if (next) form.reset(defaults);
    setOpen(next);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(true)}
        data-test={'villa-booking-dates-open'}
      >
        Change dates
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Move {props.bookingCode}</DialogTitle>
            <DialogDescription>
              The stay is re-priced for its new nights, at the same rates the
              villa is sold at. Guest details and payments stay as they are.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => execute(values))}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  name="checkIn"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check-in</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          data-test="villa-dates-check-in"
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
                      <FormLabel>Check-out</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          data-test="villa-dates-check-out"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="bg-card rounded-md border p-3 text-sm">
                {nights > 0 ? (
                  <p>
                    <span className="font-medium">
                      {nights} night{nights === 1 ? '' : 's'}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}
                      · was {nightsBetween(props.checkIn, props.checkOut)} night
                      {nightsBetween(props.checkIn, props.checkOut) === 1
                        ? ''
                        : 's'}{' '}
                      ({props.checkIn} to {props.checkOut})
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Check-out must be after check-in.
                  </p>
                )}
                <p className="text-muted-foreground mt-1">
                  The new total is worked out on the server and shown once the
                  change is saved.
                </p>
              </div>

              <FormField
                name="reason"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Why are the dates changing?</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="e.g. Guest asked to move the stay forward by two days"
                        data-test="villa-dates-reason"
                      />
                    </FormControl>
                    <FormDescription>
                      Kept in the booking history with the old and new dates.
                      Not shown to the guest.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  data-test="villa-dates-discard"
                >
                  Discard
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || nights < 1 || unchanged}
                  data-test="villa-dates-save"
                >
                  {isPending ? 'Moving…' : 'Move booking'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
