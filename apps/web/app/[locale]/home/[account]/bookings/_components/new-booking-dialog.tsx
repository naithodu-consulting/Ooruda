'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarPlus, CircleAlert, Loader2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Alert, AlertDescription } from '@kit/ui/alert';
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
import { Switch } from '@kit/ui/switch';
import { Textarea } from '@kit/ui/textarea';

import { RupeeInput } from '~/components/rupee-input';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { addDays } from '~/lib/villa-db/dates';
import { NEW_BOOKING_PAYMENT_STATUSES } from '~/lib/villa/constants';
import {
  BOOKING_CHANNEL_LABELS,
  OFFLINE_CHANNEL_VALUES,
  PAYMENT_STATUS_LABELS,
  channelLabel,
  paymentModeLabel,
  paymentStatusLabel,
} from '~/lib/villa/labels';

import {
  type NewBookingInput,
  NewBookingFormSchema,
} from '../_lib/schemas/bookings.schema';
import { PAYMENT_MODES } from '../_lib/schemas/payments.schema';
import { createBookingAction } from '../_lib/server/bookings-actions';
import type { QuoteView } from '../_lib/server/bookings.service';

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; quote: QuoteView }
  | { status: 'error'; message: string };

export function NewBookingDialog(props: {
  account: string;
  accountId: string;
  propertyId: string;
  bookingCutoffDate?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} data-test={'villa-booking-new'}>
        <CalendarPlus className="mr-1.5 h-4 w-4" />
        New booking
      </Button>

      {open ? (
        <NewBookingForm {...props} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function NewBookingForm(props: {
  account: string;
  accountId: string;
  propertyId: string;
  bookingCutoffDate?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const today = todayInBillingZone();

  const form = useForm<NewBookingInput>({
    resolver: zodResolver(NewBookingFormSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      checkIn: '',
      checkOut: '',
      adults: 2,
      children: 0,
      infants: 0,
      guestName: '',
      guestPhone: '',
      guestEmail: '',
      channel: 'phone',
      paymentStatus: 'unpaid',
      amountReceived: '',
      paymentMode: 'upi',
      paymentReference: '',
      specialRequests: '',
      isEvent: false,
    },
  });

  const [checkIn, checkOut, adults, children, paymentStatus] = useWatch({
    control: form.control,
    name: ['checkIn', 'checkOut', 'adults', 'children', 'paymentStatus'],
  });

  const partPaid = paymentStatus === 'partially_paid';

  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' });
  const requestId = useRef(0);

  // Live quote + availability, debounced; stale responses are dropped.
  useEffect(() => {
    const a = Number(adults);
    const c = Number(children) || 0;

    if (!checkIn || !checkOut || checkOut <= checkIn || !a || a < 1) {
      setQuote({ status: 'idle' });
      return;
    }

    const id = ++requestId.current;
    setQuote({ status: 'loading' });

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/villa/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: props.accountId,
            propertyId: props.propertyId,
            checkIn,
            checkOut,
            adults: a,
            children: c,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | (QuoteView & { message?: string })
          | null;

        if (id !== requestId.current) return;

        // Only a well-formed quote (ok true or false) is shown as one.
        setQuote(
          body && typeof body === 'object' && 'ok' in body
            ? { status: 'done', quote: body }
            : { status: 'error', message: 'Could not get a quote.' },
        );
      } catch {
        if (id === requestId.current) {
          setQuote({
            status: 'error',
            message: 'Could not reach the booking site.',
          });
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [checkIn, checkOut, adults, children, props.accountId, props.propertyId]);

  const { execute, isPending } = useAction(createBookingAction, {
    onSuccess: ({ data }) => {
      toast.success(
        data?.bookingCode ? `Booked: ${data.bookingCode}` : 'Booking confirmed',
      );
      props.onClose();
      if (data?.id) {
        router.push(
          `/home/${props.account}/bookings/${data.id}?property=${props.propertyId}`,
        );
      }
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not create the booking.'),
  });

  const canSubmit = quote.status === 'done' && quote.quote.ok && !isPending;

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] max-w-2xl overflow-y-auto"
        data-test={'villa-booking-dialog'}
      >
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            For phone, WhatsApp and walk-in guests. It blocks the dates on the
            booking site straight away.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-5"
            onSubmit={form.handleSubmit((values) => {
              if (quote.status !== 'done' || !quote.quote.ok) return;
              // Priced again on the server; this only lets it detect a change.
              execute({
                ...values,
                expectedTotalPaise: quote.quote.totalPaise,
              });
            })}
          >
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="checkIn"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-in</FormLabel>
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
                        max={props.bookingCutoffDate ?? undefined}
                        data-test={'villa-booking-checkin'}
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
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        min={checkIn ? addDays(checkIn, 1) : addDays(today, 1)}
                        max={
                          props.bookingCutoffDate
                            ? addDays(props.bookingCutoffDate, 1)
                            : undefined
                        }
                        data-test={'villa-booking-checkout'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {props.bookingCutoffDate ? (
                <p className="text-muted-foreground text-xs sm:col-span-2">
                  Bookings are available up to{' '}
                  {formatDateReadable(props.bookingCutoffDate)}.
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:col-span-2">
                {(
                  [
                    ['adults', 'Adults'],
                    ['children', 'Children'],
                    ['infants', 'Infants'],
                  ] as const
                ).map(([name, label]) => (
                  <FormField
                    key={name}
                    name={name}
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl
                          render={
                            <Input
                              {...field}
                              value={
                                (field.value as number | string | undefined) ??
                                ''
                              }
                              inputMode="numeric"
                              data-test={`villa-booking-${name}`}
                            />
                          }
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </section>

            <QuotePanel state={quote} />

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="guestName"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Guest name</FormLabel>
                    <FormControl
                      render={
                        <Input {...field} data-test={'villa-booking-name'} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="guestPhone"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl
                      render={
                        <PhoneInput
                          name={field.name}
                          ref={field.ref}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          data-test={'villa-booking-phone'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="guestEmail"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl
                      render={
                        <Input
                          {...field}
                          type="email"
                          data-test={'villa-booking-email'}
                        />
                      }
                    />
                    <FormDescription>
                      The booking confirmation goes here.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="channel"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Booked by</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-booking-channel'}
                        >
                          <SelectValue>
                            {(v: string) => channelLabel(v)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {OFFLINE_CHANNEL_VALUES.map((c) => (
                          <SelectItem
                            key={c}
                            value={c}
                            data-test={`villa-booking-channel-${c}`}
                          >
                            {BOOKING_CHANNEL_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="paymentStatus"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment so far</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-booking-payment'}
                        >
                          <SelectValue>
                            {(v: string) => paymentStatusLabel(v)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NEW_BOOKING_PAYMENT_STATUSES.map((p) => (
                          <SelectItem
                            key={p}
                            value={p}
                            data-test={`villa-booking-payment-${p}`}
                          >
                            {PAYMENT_STATUS_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      A fully paid booking is marked paid when the payment is
                      recorded (the tax invoice is issued at check-out).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {partPaid ? (
                <>
                  <FormField
                    name="amountReceived"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount received</FormLabel>
                        <FormControl
                          render={
                            <RupeeInput
                              {...field}
                              value={
                                (field.value as string | number | undefined) ??
                                ''
                              }
                              data-test={'villa-booking-amount-received'}
                            />
                          }
                        />
                        <FormDescription>
                          Becomes a receipt on the booking, and the figure the
                          guest sees in their confirmation.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    name="paymentMode"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Received by</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="w-full"
                              data-test={'villa-booking-payment-mode'}
                            >
                              <SelectValue>
                                {(v: string) => paymentModeLabel(v)}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PAYMENT_MODES.map((m) => (
                              <SelectItem
                                key={m}
                                value={m}
                                data-test={`villa-booking-payment-mode-${m}`}
                              >
                                {paymentModeLabel(m)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    name="paymentReference"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Reference (optional)</FormLabel>
                        <FormControl
                          render={
                            <Input
                              {...field}
                              autoComplete="off"
                              placeholder="UPI reference, cheque number, and so on"
                              data-test={'villa-booking-payment-reference'}
                            />
                          }
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : null}

              <FormField
                name="specialRequests"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Special requests (optional)</FormLabel>
                    <FormControl
                      render={
                        <Textarea
                          {...field}
                          rows={2}
                          data-test={'villa-booking-requests'}
                        />
                      }
                    />
                    <FormDescription>
                      The guest can see this on their booking page.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="isEvent"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
                    <div className="flex flex-col gap-1">
                      <FormLabel>This is an event</FormLabel>
                      <FormDescription>
                        Wedding, party, shoot or other function.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-test={'villa-booking-event'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                disabled={isPending}
                data-test={'villa-booking-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                data-test={'villa-booking-submit'}
              >
                {isPending ? 'Booking…' : 'Confirm booking'}
              </Button>
            </div>
            {!canSubmit && !isPending ? (
              <p
                className="text-muted-foreground -mt-3 text-right text-xs"
                aria-live="polite"
              >
                Pick available dates and guests to confirm.
              </p>
            ) : null}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function QuotePanel({ state }: { state: QuoteState }) {
  if (state.status === 'idle') {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
        Pick dates and guests to check availability and see the price.
      </p>
    );
  }

  if (state.status === 'loading') {
    return (
      <p className="text-muted-foreground flex items-center gap-2 rounded-lg border p-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking availability…
      </p>
    );
  }

  if (state.status === 'error') {
    return <QuoteError message={state.message} />;
  }

  if (!state.quote.ok) {
    return <QuoteError message={state.quote.message} />;
  }

  const q = state.quote;
  const rules = [...new Set(q.nightly.map((n) => n.rule).filter(Boolean))];

  return (
    <div
      className="bg-muted/40 rounded-lg border p-3"
      data-test={'villa-booking-quote'}
    >
      <p className="text-success mb-2 text-sm font-medium">Available</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">
          {q.nights} night{q.nights === 1 ? '' : 's'}
          {q.nightly.length > 0
            ? ` (${formatDateReadable(q.nightly[0]!.date)} onwards)`
            : ''}
        </dt>
        <dd className="text-right tabular-nums">{formatINR(q.base)}</dd>
        {q.extraGuests > 0 ? (
          <>
            <dt className="text-muted-foreground">
              {q.extraGuests} extra guest{q.extraGuests === 1 ? '' : 's'}
            </dt>
            <dd className="text-right tabular-nums">
              {formatINR(q.extraGuestAmount)}
            </dd>
          </>
        ) : null}
        {q.taxLines.map((line) => (
          <div key={line.rate} className="contents">
            <dt className="text-muted-foreground">GST {line.rate}%</dt>
            <dd className="text-right tabular-nums">{formatINR(line.tax)}</dd>
          </div>
        ))}
        <dt className="border-t pt-1 font-semibold">Total</dt>
        <dd
          className="border-t pt-1 text-right font-semibold tabular-nums"
          data-test={'villa-booking-total'}
        >
          {formatINR(q.total)}
        </dd>
      </dl>
      {rules.length > 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Includes seasonal rate: {rules.join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function QuoteError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" data-test={'villa-booking-quote-error'}>
      <CircleAlert className="h-4 w-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
