'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { normalizePhoneNumber } from '@kit/shared/utils';
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
import { PhoneInput } from '@kit/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import { splitGuestName } from '~/lib/villa/booking-edit';

import {
  SALUTATIONS,
  type Salutation,
  type UpdateBookingInput,
  UpdateBookingSchema,
} from '../_lib/schemas/bookings.schema';
import { updateBookingAction } from '../_lib/server/bookings-actions';

/**
 * The stored salutation is KEPT, even when it is not one of the three the
 * booking form offers.
 *
 * The site's own checkout, its admin and any import can hold 'Dr', 'Miss',
 * 'Shri' or nothing at all. Falling back to 'Mr' would re-title a guest on
 * their registration card and GST invoice as a side effect of fixing a phone
 * number, and a pre-selected 'Mr' reads as the stored value rather than as a
 * substitution - so an unrecognised value is offered as its own option
 * instead.
 */
function isKnownSalutation(value: string): value is Salutation {
  return SALUTATIONS.includes(value as Salutation);
}

/**
 * Corrects a booking's guest details (edit booking Phase 1).
 *
 * Dates and money are absent on purpose: a date change needs the booking
 * site's atomic availability check and a price change needs the invoice
 * rules. The guest counts are here, but the server declines a change that
 * would leave the stay priced for a different sized party - see
 * `lib/villa/booking-edit.ts`.
 */
export function EditBookingDialog(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  bookingCode: string | null;
  /** True for a stay a channel sold: its dates and price live on the channel. */
  isChannelSold: boolean;
  /**
   * `bookings.updated_at` as this page rendered it. Sent back with the save so
   * the server can refuse rather than overwrite a change someone else made in
   * the meantime.
   */
  siteUpdatedAt: string;
  guest: {
    salutation: string | null;
    /** The site's joined `guest_name`; the parts below can both be null. */
    guestName: string;
    firstName: string | null;
    lastName: string | null;
    guestPhone: string;
    guestEmail: string;
    adults: number;
    children: number;
    infants: number;
    specialRequests: string | null;
  };
}) {
  const [open, setOpen] = useState(false);

  const defaults: UpdateBookingInput = {
    accountId: props.accountId,
    propertyId: props.propertyId,
    bookingId: props.bookingId,
    siteUpdatedAt: props.siteUpdatedAt,
    salutation: props.guest.salutation?.trim() ?? '',
    ...splitGuestName(props.guest.guestName, {
      firstName: props.guest.firstName,
      lastName: props.guest.lastName,
    }),
    // PhoneInput takes E.164 and renders an EMPTY field for anything it cannot
    // parse. The site stores Indian mobiles as bare 10 digits, so seeding it
    // raw showed no number at all - and saving that blank would have wiped the
    // guest's phone. Converted here, and the server converts back on write.
    guestPhone: props.guest.guestPhone
      ? (normalizePhoneNumber(props.guest.guestPhone) ?? props.guest.guestPhone)
      : '',
    guestEmail: props.guest.guestEmail ?? '',
    adults: props.guest.adults,
    children: props.guest.children,
    infants: props.guest.infants,
    specialRequests: props.guest.specialRequests ?? '',
    // Never pre-filled: an unconsidered reason is worse than none, and the
    // entry it lands in is the booking's audit trail.
    reason: '',
  };

  const form = useForm({
    resolver: zodResolver(UpdateBookingSchema),
    defaultValues: defaults,
  });

  const { execute, isPending } = useAction(updateBookingAction, {
    onSuccess: ({ data }) => {
      if (data && !data.auditWritten) {
        // The booking IS saved; only its history entry is not. Said plainly,
        // because the reason behind the change is now only in the operator's
        // head and nothing will reconstruct it.
        toast.warning(
          'Booking updated, but the change could not be written to the booking history. Note the reason elsewhere and tell whoever runs the site.',
          { duration: 12_000 },
        );
      } else {
        toast.success(
          data?.changedFields
            ? 'Booking updated. The change is in the booking history.'
            : 'Nothing was different, so nothing changed.',
        );
      }

      setOpen(false);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not update the booking.'),
  });

  // Re-seed from the booking each time it opens, so a cancelled edit does not
  // leave half-typed values behind for the next one.
  function onOpenChange(next: boolean) {
    if (next) form.reset(defaults);
    setOpen(next);
  }

  const countField = (
    name: 'adults' | 'children' | 'infants',
    label: string,
  ) => (
    <FormField
      name={name}
      control={form.control}
      render={({ field }) => (
        <FormItem className="sm:col-span-4">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={(field.value as number | string | undefined) ?? ''}
              inputMode="numeric"
              data-test={`villa-edit-${name}`}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(true)}
        data-test={'villa-booking-edit-open'}
      >
        Edit booking
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          data-test={'villa-booking-edit-dialog'}
        >
          <DialogHeader>
            <DialogTitle>
              Edit {props.bookingCode ?? 'this booking'}
            </DialogTitle>
            <DialogDescription>
              {props.isChannelSold
                ? 'Guest details only. The dates and the amount were set by the channel that sold this stay and are changed there.'
                : 'Guest details only. Dates and amounts cannot be changed here.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className="grid grid-cols-1 gap-4 sm:grid-cols-12"
              onSubmit={form.handleSubmit((values) => execute(values))}
            >
              <FormField
                name="salutation"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Salutation</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-edit-salutation'}
                        >
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SALUTATIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                        {field.value && !isKnownSalutation(field.value) ? (
                          <SelectItem value={field.value}>
                            {field.value}
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="firstName"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-5">
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        placeholder="First name"
                        data-test={'villa-edit-first-name'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="lastName"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-4">
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        placeholder="Surname"
                        data-test={'villa-edit-last-name'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="guestPhone"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-6">
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        data-test={'villa-edit-guest-phone'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="guestEmail"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-6">
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        autoComplete="off"
                        data-test={'villa-edit-guest-email'}
                      />
                    </FormControl>
                    <FormDescription>
                      Where the guest emails for this booking are sent.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {countField('adults', 'Adults')}
              {countField('children', 'Children')}
              {countField('infants', 'Infants')}

              <FormField
                name="specialRequests"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-12">
                    <FormLabel>Special requests</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={2}
                          data-test={'villa-edit-special-requests'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="reason"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-12">
                    <FormLabel>Why is this changing?</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder="e.g. Guest called to correct the spelling on the invoice"
                          data-test={'villa-edit-reason'}
                        />
                      }
                    />
                    <FormDescription>
                      Kept in the booking history with the fields that changed.
                      Not shown to the guest.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col-reverse gap-2 sm:col-span-12 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                  data-test={'villa-booking-edit-discard'}
                >
                  Discard
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  data-test={'villa-booking-edit-save'}
                >
                  {isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
