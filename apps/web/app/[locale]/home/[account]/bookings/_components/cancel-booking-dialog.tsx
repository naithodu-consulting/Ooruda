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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import {
  type CancelBookingInput,
  CancelBookingSchema,
} from '../_lib/schemas/bookings.schema';
import { cancelBookingAction } from '../_lib/server/bookings-actions';

interface Reason {
  code: string;
  label: string;
  initiated_by: string;
  note_required: boolean;
}

const GROUPS: { title: string; match: (r: Reason) => boolean }[] = [
  { title: 'Guest', match: (r) => r.initiated_by === 'guest' },
  { title: 'Payment or fraud', match: (r) => r.initiated_by === 'system' },
  { title: 'Villa side', match: (r) => r.initiated_by === 'host' },
  { title: 'Outside events', match: (r) => r.initiated_by === 'external' },
  { title: 'Other', match: (r) => r.initiated_by === 'any' },
];

export function CancelBookingDialog(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  bookingCode: string | null;
  reasons: Reason[];
}) {
  const [open, setOpen] = useState(false);

  const form = useForm<CancelBookingInput>({
    resolver: zodResolver(CancelBookingSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      bookingId: props.bookingId,
      reasonCode: '',
      note: '',
    },
  });

  const reasonCode = useWatch({ control: form.control, name: 'reasonCode' });
  const reason = props.reasons.find((r) => r.code === reasonCode);

  const { execute, isPending } = useAction(cancelBookingAction, {
    onSuccess: () => {
      toast.success('Booking cancelled. The dates are free again.');
      setOpen(false);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not cancel the booking.'),
  });

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-destructive"
        data-test={'villa-booking-cancel-open'}
      >
        Cancel booking
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md"
          data-test={'villa-booking-cancel-dialog'}
        >
          <DialogHeader>
            <DialogTitle>
              Cancel {props.bookingCode ?? 'this booking'}?
            </DialogTitle>
            <DialogDescription>
              The dates become bookable again straight away. Refunds are handled
              separately.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit((values) => {
                if (reason?.note_required && !values.note.trim()) {
                  form.setError('note', {
                    message: 'Add a note for this reason',
                  });
                  return;
                }
                execute(values);
              })}
            >
              <FormField
                name="reasonCode"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-booking-cancel-reason'}
                        >
                          <SelectValue placeholder="Pick a reason">
                            {(code: string) =>
                              props.reasons.find((r) => r.code === code)
                                ?.label ?? 'Pick a reason'
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GROUPS.map((group) => {
                          const items = props.reasons.filter(group.match);
                          if (items.length === 0) return null;

                          return (
                            <SelectGroup key={group.title}>
                              <SelectLabel>{group.title}</SelectLabel>
                              {items.map((r) => (
                                <SelectItem
                                  key={r.code}
                                  value={r.code}
                                  data-test={`villa-cancel-reason-${r.code}`}
                                >
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="note"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {reason?.note_required ? 'Note' : 'Note (optional)'}
                    </FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={3}
                          data-test={'villa-booking-cancel-note'}
                        />
                      }
                    />
                    <FormDescription>
                      Kept in the booking history. Not shown to the guest.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  data-test={'villa-booking-cancel-keep'}
                >
                  Keep booking
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending || !reasonCode}
                  data-test={'villa-booking-cancel-confirm'}
                >
                  {isPending ? 'Cancelling…' : 'Cancel booking'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
