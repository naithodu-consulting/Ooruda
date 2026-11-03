'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarPlus, CircleAlert, Loader2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm, useWatch } from 'react-hook-form';

import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import { Checkbox } from '@kit/ui/checkbox';
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
  /** villa_admin only: may record a stay past the cutoff, after confirming. */
  canOverrideCutoff?: boolean;
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
  canOverrideCutoff?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const today = todayInBillingZone();
  const cutoff = props.bookingCutoffDate ?? null;
  // An admin may pick dates past the cutoff; everyone else is capped at it.
  const maxCheckIn = props.canOverrideCutoff
    ? undefined
    : (cutoff ?? undefined);

  const form = useForm<NewBookingInput>({
    resolver: zodResolver(NewBookingFormSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      checkIn: '',
      checkOut: '',
      adults: 8,
      children: 0,
      infants: 0,
      salutation: 'Mr',
      firstName: '',
      lastName: '',
      guestPhone: '',
      guestEmail: '',
      channel: 'phone',
      paymentStatus: 'unpaid',
      amountReceived: '',
      paymentMode: 'upi',
      paymentReference: '',
      specialRequests: '',
      isEvent: false,
      overrideCutoff: false,
    },
  });

  const [checkIn, checkOut, adults, children, paymentStatus, overrideCutoff] =
    useWatch({
      control: form.control,
      name: [
        'checkIn',
        'checkOut',
        'adults',
        'children',
        'paymentStatus',
        'overrideCutoff',
      ],
    });

  const hasPaid =
    paymentStatus === 'partially_paid' || paymentStatus === 'paid';
  // The chosen check-in is past the date the public site stops selling.
  const checkInPastCutoff = !!cutoff && !!checkIn && checkIn > cutoff;

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
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/villa/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            accountId: props.accountId,
            propertyId: props.propertyId,
            checkIn,
            checkOut,
            adults: a,
            children: c,
            overrideCutoff: !!overrideCutoff,
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
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (id === requestId.current) {
          setQuote({
            status: 'error',
            message: 'Could not reach the booking site.',
          });
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    checkIn,
    checkOut,
    adults,
    children,
    overrideCutoff,
    props.accountId,
    props.propertyId,
  ]);

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
  const [pendingOverride, setPendingOverride] = useState<
    (NewBookingInput & { expectedTotalPaise: number }) | null
  >(null);

  return (
    <>
      <Dialog
        // Hidden, not unmounted, while the override is being confirmed: the
        // form keeps its values, and the confirmation is the only thing on
        // screen rather than a second panel inside this one.
        open={!pendingOverride}
        onOpenChange={(open) => (!open ? props.onClose() : undefined)}
      >
        <DialogContent
          className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"
          data-test={'villa-booking-dialog'}
        >
          <DialogHeader>
            <DialogTitle>New booking</DialogTitle>
            <DialogDescription>
              For phone, WhatsApp and walk-in guests.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className="flex flex-col gap-5"
              onSubmit={form.handleSubmit((values) => {
                if (quote.status !== 'done' || !quote.quote.ok) return;

                // Priced again on the server; this only lets it detect a change.
                const payload = {
                  ...values,
                  expectedTotalPaise: quote.quote.totalPaise,
                };

                // Past the cutoff the tick is not the last word: the stay is one
                // the website would have refused, so it is confirmed once more
                // with the dates spelled out.
                if (quote.quote.pastCutoff) {
                  setPendingOverride(payload);
                  return;
                }

                execute(payload);
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
                          max={maxCheckIn}
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
                          min={
                            checkIn ? addDays(checkIn, 1) : addDays(today, 1)
                          }
                          max={maxCheckIn ? addDays(maxCheckIn, 1) : undefined}
                          data-test={'villa-booking-checkout'}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {cutoff && !checkInPastCutoff ? (
                  <p className="text-muted-foreground text-xs sm:col-span-2">
                    The website takes bookings only up to the cutoff date i.e.{' '}
                    {formatDateReadable(cutoff)}.
                    {props.canOverrideCutoff
                      ? ' You can record one past that date yourself.'
                      : ''}
                  </p>
                ) : null}

                {/*
                Past the cutoff the public site refuses this stay. An admin may
                still record one agreed by phone, but only by ticking this: it
                is what the server checks, and the booking's trail says it was
                an override.
              */}
                {checkInPastCutoff && props.canOverrideCutoff ? (
                  <FormField
                    name="overrideCutoff"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem className="border-destructive/40 bg-destructive/5 flex flex-row items-start gap-3 rounded-lg border p-3 sm:col-span-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) =>
                              field.onChange(checked === true)
                            }
                            className="mt-0.5"
                            data-test={'villa-booking-override-cutoff'}
                          />
                        </FormControl>
                        <div className="flex flex-col gap-1">
                          <FormLabel>
                            Record this booking past the cutoff
                          </FormLabel>
                          <FormDescription>
                            The website and booking channels stop selling after{' '}
                            {formatDateReadable(cutoff!)}. This stay will be
                            held on the calendar anyway, and your name is
                            recorded against the decision.
                          </FormDescription>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                ) : null}

                {checkInPastCutoff && !props.canOverrideCutoff ? (
                  <p className="text-destructive text-xs sm:col-span-2">
                    Bookings are closed after {formatDateReadable(cutoff!)}.
                    Only a villa admin can record a stay past that date.
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
                                  (field.value as
                                    | number
                                    | string
                                    | undefined) ?? ''
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

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                <FormField
                  name="salutation"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="sm:col-span-3">
                      <FormLabel>Salutation</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger
                            className="w-full"
                            data-test={'villa-booking-salutation'}
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
                      <FormControl
                        render={
                          <Input
                            {...field}
                            data-test={'villa-booking-first-name'}
                          />
                        }
                      />
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
                      <FormControl
                        render={
                          <Input
                            {...field}
                            data-test={'villa-booking-last-name'}
                          />
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
                    <FormItem className="sm:col-span-6">
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
                    <FormItem className="sm:col-span-6">
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
                        The booking confirmation goes here, once a payment is
                        recorded.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="channel"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="sm:col-span-6">
                      <FormLabel>Booking Method</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
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
                    <FormItem className="sm:col-span-6">
                      <FormLabel>Payment Status</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
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
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasPaid ? (
                  <>
                    <FormField
                      name="amountReceived"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="sm:col-span-4">
                          <FormLabel>Amount received</FormLabel>
                          <FormControl
                            render={
                              <RupeeInput
                                {...field}
                                value={
                                  (field.value as
                                    | string
                                    | number
                                    | undefined) ?? ''
                                }
                                data-test={'villa-booking-amount-received'}
                              />
                            }
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      name="paymentMode"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="sm:col-span-4">
                          <FormLabel>Payment Method</FormLabel>
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
                        <FormItem className="sm:col-span-4">
                          <FormLabel>Reference (optional)</FormLabel>
                          <FormControl
                            render={
                              <Input
                                {...field}
                                autoComplete="off"
                                placeholder="UPI reference, cheque number"
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
                    <FormItem className="sm:col-span-12">
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
                        The guest can see this on their booking page and on the
                        guest info card.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="isEvent"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-12">
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
                  {isPending
                    ? 'Booking…'
                    : quote.status === 'done' &&
                        quote.quote.ok &&
                        quote.quote.pastCutoff
                      ? 'Confirm past cutoff'
                      : 'Confirm booking'}
                </Button>
              </div>
              {!canSubmit && !isPending ? (
                <p
                  className="text-muted-foreground -mt-3 text-right text-xs"
                  aria-live="polite"
                >
                  Select available dates and guests to confirm booking.
                </p>
              ) : null}
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingOverride}
        onOpenChange={(next) => (!next ? setPendingOverride(null) : undefined)}
      >
        <AlertDialogContent data-test={'villa-booking-override-confirm'}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Record a booking past the cutoff?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cutoff
                ? `The website and booking channels take no check-in after ${formatDateReadable(cutoff)}.`
                : ''}{' '}
              {pendingOverride
                ? `This stay checks in on ${formatDateReadable(pendingOverride.checkIn)}.`
                : ''}{' '}
              It will hold those nights on the calendar, and the booking&apos;s
              history will show that you recorded it past the cutoff.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-test={'villa-booking-override-cancel'}>
              Go back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingOverride) return;
                execute(pendingOverride);
                setPendingOverride(null);
              }}
              data-test={'villa-booking-override-proceed'}
            >
              Record the booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuotePanel({ state }: { state: QuoteState }) {
  if (state.status === 'idle') {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
        Select dates to check availability and see the price.
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
