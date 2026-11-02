'use client';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import { Checkbox } from '@kit/ui/checkbox';
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
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import { formatDateReadable } from '~/lib/format-date';
import { lastNightOf } from '~/lib/villa-db/dates';
import { formatNights } from '~/lib/villa/labels';

import {
  type EnrichChannelStayInput,
  EnrichChannelStaySchema,
} from '../_lib/schemas/bookings.schema';
import { enrichChannelStayAction } from '../_lib/server/bookings-actions';

/** The imported stay being filled in. */
export interface EnrichableChannelStay {
  /**
   * The channel event, by the key that survives a sync. The blocked_dates row
   * id is deliberately not used: `apply_ical_feed` replaces every row on
   * every sync, so an id read at render time is often gone by submit time.
   */
  feedId: string;
  externalUid: string;
  channelName: string | null;
  startDate: string;
  /** Exclusive: the morning after the last night held. */
  endDate: string;
  nights: number;
  confirmationCode: string | null;
  phoneLast4: string | null;
}

/**
 * Records the guest and the money for a stay a booking channel sold.
 *
 * The channel's calendar gives nights and, if we are lucky, a confirmation
 * code and four digits of a phone number — never a name, never an amount. So
 * the dates are shown and not editable (the feed owns them), and everything
 * the operator knows from the channel's own dashboard is typed here once.
 */
export function EnrichChannelStayDialog(props: {
  accountId: string;
  propertyId: string;
  stay: EnrichableChannelStay;
  onClose: () => void;
}) {
  const router = useRouter();
  const { stay } = props;
  const channel = stay.channelName ?? 'the channel';

  const form = useForm<EnrichChannelStayInput>({
    resolver: zodResolver(EnrichChannelStaySchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      feedId: stay.feedId,
      externalUid: stay.externalUid,
      checkIn: stay.startDate,
      checkOut: stay.endDate,
      guestName: '',
      guestPhone: '',
      guestEmail: '',
      adults: 2,
      children: 0,
      infants: 0,
      payoutAmount: '' as unknown as number,
      taxAmount: 0,
      payoutReceived: false,
      // Left empty on purpose: this is the guest's own request, shown on the
      // voucher and the registration card. The channel's confirmation code
      // is recorded on the booking's trail and against the payout, not here.
      specialRequests: '',
    },
  });

  const [payoutAmount, taxAmount] = useWatch({
    control: form.control,
    name: ['payoutAmount', 'taxAmount'],
  });

  const stayAmount = Number(payoutAmount || 0) - Number(taxAmount || 0);

  const { execute, isPending } = useAction(enrichChannelStayAction, {
    onSuccess: () => {
      toast.success('Stay recorded');
      props.onClose();
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not record this stay.'),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[90vh] max-w-xl overflow-y-auto"
        data-test={'villa-enrich-channel-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Add booking details</DialogTitle>
          <DialogDescription>
            {channel} sold {formatDateReadable(stay.startDate)} to{' '}
            {formatDateReadable(lastNightOf(stay.endDate))} (last night) —{' '}
            {formatNights(stay.nights)}
            {stay.confirmationCode ? `, ${stay.confirmationCode}` : ''}
            {stay.phoneLast4 ? `, phone ending ${stay.phoneLast4}` : ''}. Fill
            in who stayed and what you earned, and the stay starts counting in
            your reports.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => execute(values))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="guestName"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Guest name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        placeholder="As it appears on the channel"
                        data-test={'villa-enrich-guest-name'}
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
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        data-test={'villa-enrich-guest-phone'}
                      />
                    </FormControl>
                    <FormDescription>
                      {stay.phoneLast4
                        ? `${channel} gave the last four digits: ${stay.phoneLast4}.`
                        : 'If the guest shared it on the channel.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="guestEmail"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        autoComplete="off"
                        data-test={'villa-enrich-guest-email'}
                      />
                    </FormControl>
                    <FormDescription>
                      No confirmation email is sent: {channel} has already sent
                      the guest theirs.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="adults"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adults</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="numeric"
                        data-test={'villa-enrich-adults'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="children"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Children</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="numeric"
                        data-test={'villa-enrich-children'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="payoutAmount"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount earned (₹)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="decimal"
                        placeholder="Payout from the channel"
                        data-test={'villa-enrich-payout'}
                      />
                    </FormControl>
                    <FormDescription>
                      What {channel} pays you for this stay, not what the guest
                      paid them.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="taxAmount"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST inside that (₹)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="decimal"
                        data-test={'villa-enrich-tax'}
                      />
                    </FormControl>
                    <FormDescription>
                      Leave at 0 if {channel} collects and pays the GST. Ask
                      your accountant if you are not sure.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="specialRequests"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        data-test={'villa-enrich-notes'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="payoutReceived"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="bg-muted/40 flex flex-row items-start gap-3 rounded-lg border p-3 sm:col-span-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        className="mt-0.5"
                        data-test={'villa-enrich-payout-received'}
                      />
                    </FormControl>
                    <div className="flex flex-col gap-1">
                      <FormLabel>The payout is already in the bank</FormLabel>
                      <FormDescription>
                        Records a receipt for the full amount, so the stay shows
                        as paid and the money appears in your reports. Leave it
                        off and record the payment when it lands.
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <p className="text-muted-foreground text-sm" aria-live="polite">
              {stayAmount > 0
                ? `Stay amount ₹${stayAmount.toLocaleString('en-IN')} before GST.`
                : 'The nights stay held by the channel either way — this only records who stayed and what you earned.'}
            </p>

            {/* Not DialogFooter: its bg-muted band clashes with the dialog. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                data-test={'villa-enrich-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-test={'villa-enrich-submit'}
              >
                {isPending ? 'Saving…' : 'Save booking'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
