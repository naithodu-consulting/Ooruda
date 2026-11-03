'use client';

import { useRouter } from 'next/navigation';

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

import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { lastNightOf } from '~/lib/villa-db/dates';
import { formatNights } from '~/lib/villa/labels';

import {
  type EnrichChannelStayInput,
  EnrichChannelStaySchema,
} from '../_lib/schemas/bookings.schema';
import { enrichChannelStayAction } from '../_lib/server/bookings-actions';

/** The imported stay being filled in. */
export interface EnrichableChannelStay {
  feedId: string;
  externalUid: string;
  channelName: string | null;
  startDate: string;
  endDate: string;
  nights: number;
  confirmationCode: string | null;
  phoneLast4: string | null;
}

export function EnrichChannelStayDialog(props: {
  account: string;
  accountId: string;
  propertyId: string;
  stay: EnrichableChannelStay;
  onClose: () => void;
}) {
  const router = useRouter();
  const { stay } = props;
  const channel = stay.channelName ?? 'Airbnb';

  const form = useForm<EnrichChannelStayInput>({
    resolver: zodResolver(EnrichChannelStaySchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      feedId: stay.feedId,
      externalUid: stay.externalUid,
      checkIn: stay.startDate,
      checkOut: stay.endDate,
      salutation: 'Mr',
      firstName: '',
      lastName: '',
      guestPhone: '',
      guestEmail: '',
      adults: 2,
      children: 0,
      infants: 0,
      baseAmount: '' as unknown as number,
      gstAmount: '' as unknown as number,
      airbnbCharges: '' as unknown as number,
      specialRequests: '',
    },
  });

  const [baseAmount, gstAmount, airbnbCharges] = useWatch({
    control: form.control,
    name: ['baseAmount', 'gstAmount', 'airbnbCharges'],
  });

  const parsedBase = Number(baseAmount) || 0;
  const parsedGst = Number(gstAmount) || 0;
  const parsedCharges = Number(airbnbCharges) || 0;
  const calculatedTotal = parsedBase + parsedGst;
  const netPayout = Math.max(0, calculatedTotal - parsedCharges);

  const { execute, isPending } = useAction(enrichChannelStayAction, {
    onSuccess: ({ data }) => {
      toast.success('Stay recorded');
      props.onClose();
      if (data?.id) {
        router.push(
          `/home/${props.account}/bookings/${data.id}?property=${props.propertyId}`,
        );
      } else {
        router.refresh();
      }
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not record this stay.'),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        data-test={'villa-enrich-channel-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Add booking details</DialogTitle>
          <DialogDescription>
            {channel} · {formatDateReadable(stay.startDate)} –{' '}
            {formatDateReadable(lastNightOf(stay.endDate))} (
            {formatNights(stay.nights)})
            {stay.confirmationCode ? ` · ${stay.confirmationCode}` : ''}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(
              (values) => {
                const base = Number(values.baseAmount) || 0;
                const gst = Number(values.gstAmount) || 0;
                const total = base + gst;
                execute({
                  ...values,
                  baseAmount: base,
                  gstAmount: gst,
                  totalAmount: total,
                  airbnbCharges: Number(values.airbnbCharges) || 0,
                });
              },
              (errors) => {
                const firstError = Object.values(errors)[0];
                if (firstError?.message) {
                  toast.error(String(firstError.message));
                }
              },
            )}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
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
                          data-test={'villa-enrich-salutation'}
                        >
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Mr">Mr</SelectItem>
                        <SelectItem value="Mrs">Mrs</SelectItem>
                        <SelectItem value="Ms">Ms</SelectItem>
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
                        data-test={'villa-enrich-first-name'}
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
                    <FormLabel>Last name </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        placeholder="Surname"
                        data-test={'villa-enrich-last-name'}
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
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        data-test={'villa-enrich-guest-phone'}
                      />
                    </FormControl>
                    {stay.phoneLast4 ? (
                      <FormDescription>
                        Channel phone ends in {stay.phoneLast4}
                      </FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="guestEmail"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-6">
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        autoComplete="off"
                        data-test={'villa-enrich-guest-email'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="adults"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-4">
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
                  <FormItem className="sm:col-span-4">
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
                name="infants"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-4">
                    <FormLabel>Infants</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="numeric"
                        data-test={'villa-enrich-infants'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="baseAmount"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-6">
                    <FormLabel>Base Amount</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="decimal"
                        placeholder="e.g. 15000"
                        data-test={'villa-enrich-base-amount'}
                      />
                    </FormControl>
                    <FormDescription>
                      Booking tariff charged to customer before GST.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="gstAmount"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-6">
                    <FormLabel>GST</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="decimal"
                        placeholder="0 if exempt/included"
                        data-test={'villa-enrich-gst-amount'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm sm:col-span-12">
                <div>
                  <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Guest Booking Total
                  </span>
                  <p className="text-base font-bold tabular-nums">
                    {formatINR(calculatedTotal)}
                  </p>
                </div>
                {parsedCharges > 0 ? (
                  <div className="text-right">
                    <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Net host payout
                    </span>
                    <p className="text-success text-base font-bold tabular-nums">
                      {formatINR(netPayout)}
                    </p>
                  </div>
                ) : null}
              </div>

              <FormField
                name="airbnbCharges"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-12">
                    <FormLabel>{channel} charges</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          (field.value as number | string | undefined) ?? ''
                        }
                        inputMode="decimal"
                        placeholder="e.g. 2000 (commission/fee)"
                        data-test={'villa-enrich-airbnb-charges'}
                      />
                    </FormControl>
                    <FormDescription>
                      Commission and other fees deducted by {channel} from host
                      payout. Not displayed in booking details.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="specialRequests"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-12">
                    <FormLabel>Special requests (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="e.g. late check-in, extra towels, dietary preferences"
                        data-test={'villa-enrich-special-requests'}
                      />
                    </FormControl>
                    <FormDescription>
                      Shows up in booking details and on the guest info card
                      (Remarks).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
