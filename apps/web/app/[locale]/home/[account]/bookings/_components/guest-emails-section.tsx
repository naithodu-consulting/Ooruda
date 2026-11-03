import { Mail } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';

import type { VillaRole } from '~/lib/roles';
import type { SiteBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { todayIst } from '~/lib/villa-db/dates';
import { getBaseRates } from '~/lib/villa-db/rates';
import {
  NO_PAYMENT_REASON,
  hasRecordedPayment,
} from '~/lib/villa/booking-payments';
import {
  GUEST_EMAIL_LABELS,
  type GuestEmailTemplate,
  THANK_YOU_DELAY_HOURS,
  blockedForChannelStay,
  preArrivalWindow,
} from '~/lib/villa/guest-emails';
import { loadVillaAccountSettings } from '~/lib/villa/settings';

import { GuestEmailButton, UndoCheckoutButton } from './guest-email-buttons';

const when = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/**
 * The guest emails for one booking: what went, what was skipped and why,
 * and when the next one goes. Rendered in Suspense on the booking page.
 */
export async function GuestEmailsSection(props: {
  accountId: string;
  propertyId: string;
  booking: SiteBooking;
  role: VillaRole;
}) {
  const client = getSupabaseServerClient();
  const { booking } = props;

  // Request-cached, and the rates read below needs it too.
  const site = await getVillaSite(props.accountId, props.propertyId);

  const [rates, logResult, settings, lastResult, paid] = await Promise.all([
    getBaseRates(site),
    client
      .from('villa_message_log')
      .select(
        'template, manual, status, reason, check_in, created_at, updated_at',
      )
      .eq('property_id', props.propertyId)
      .eq('site_booking_id', booking.id)
      .order('created_at'),
    // Request-cached, so this is free: the booking page above already read it.
    loadVillaAccountSettings(props.accountId),
    client
      .from('villa_booking_activity')
      .select('action, created_at')
      .eq('property_id', props.propertyId)
      .eq('site_booking_id', booking.id)
      .in('action', ['completed', 'reopened'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // The confirmation quotes a cancellation ladder in rupees, so it goes
    // only once the guest has actually paid something - website payments and
    // offline receipts alike, less refunds. Same rule the send itself
    // enforces (lib/villa/booking-payments.ts).
    hasRecordedPayment(client, site, props.propertyId, booking),
  ]);

  const error = logResult.error ?? lastResult.error;
  if (error) throw new Error('Could not load the guest emails.');

  const log = logResult.data ?? [];
  const on = {
    booking_confirmation: settings.bookingConfirmationEmail,
    pre_arrival: settings.preArrivalEmail,
    thank_you: settings.thankYouEmail,
  };
  const checkedOutAt =
    lastResult.data?.action === 'completed'
      ? new Date(lastResult.data.created_at)
      : null;
  // What to call the channel on screen. `booking_channel` is the only name
  // the booking carries ('airbnb' for Airbnb, 'channel' for any other feed);
  // the feed's own name lives on the block, which this card does not read.
  const channelName =
    booking.channel === 'airbnb' ? 'Airbnb' : 'The booking channel';

  const isAdmin = props.role === 'villa_admin';
  const canUndo =
    isAdmin &&
    booking.status === 'completed' &&
    !booking.invoiceNumber &&
    checkedOutAt !== null &&
    Date.now() - checkedOutAt.getTime() < 24 * 3_600_000;

  function status(template: GuestEmailTemplate): string {
    // Ahead of everything else, including the log: this one is not sent at
    // all, so a stale "sent automatically" or "enabled once paid" line would
    // promise something the server refuses.
    if (blockedForChannelStay(template, booking)) {
      return `Booked through ${channelName}`;
    }

    const auto = log.findLast(
      (l) =>
        l.template === template &&
        !l.manual &&
        (template !== 'pre_arrival' || l.check_in === booking.checkIn),
    );
    const manual = log.filter(
      (l) => l.template === template && l.manual && l.status === 'sent',
    );

    const extra = manual.length
      ? ` Sent by hand ${manual.length === 1 ? 'once' : `${manual.length} times`}, last ${when(manual.at(-1)!.updated_at)}.`
      : '';

    if (auto?.status === 'sent')
      return `Sent ${when(auto.updated_at)}.${extra}`;
    if (!on[template]) return `Switched off in Villa Settings.${extra}`;
    if (auto?.status === 'skipped') {
      // The no-payment skip is the one that can go stale: once the advance is
      // recorded the sentence would otherwise still read as if the booking
      // were unpaid, next to a button that now works. Matched on the reason,
      // so a skip for any other cause still shows its own.
      if (auto.reason === NO_PAYMENT_REASON && paid) {
        return `Not sent automatically — no payment was recorded at the time. Send it from here.${extra}`;
      }

      return `Not sent: ${auto.reason ?? 'skipped'}.${extra}`;
    }
    if (auto?.status === 'failed') {
      return `Could not be sent (${auto.reason ?? 'error'}). Use Send now to try again.${extra}`;
    }
    if (auto?.status === 'sending') {
      return Date.now() - Date.parse(auto.updated_at) > 10 * 60_000
        ? `Delivery unknown (the send was interrupted). Check with the guest before using Send now.${extra}`
        : `Sending now.${extra}`;
    }

    if (template === 'booking_confirmation') {
      if (paid) {
        return manual.length > 0 ? extra.trim() : 'Ready to send.';
      }
      return 'Enabled once a payment is recorded.';
    }

    if (template === 'pre_arrival') {
      if (booking.status !== 'confirmed')
        return `Not sent: the stay is ${booking.status}.${extra}`;
      const { opens, closes } = preArrivalWindow(
        booking.checkIn,
        rates.checkInTime,
      );
      if (Date.now() >= closes.getTime())
        return `Not sent: booked too close to arrival.${extra}`;
      return `Goes automatically ${when(opens)}, if the stay is still confirmed then.${extra}`;
    }

    if (booking.status === 'completed' && checkedOutAt) {
      return `Goes automatically ${when(new Date(checkedOutAt.getTime() + THANK_YOU_DELAY_HOURS * 3_600_000))}, ${THANK_YOU_DELAY_HOURS} hours after check-out.${extra}`;
    }
    if (booking.status === 'cancelled')
      return `Not sent: the stay was cancelled.${extra}`;
    return `Goes ${THANK_YOU_DELAY_HOURS} hours after you check the guest out.${extra}`;
  }

  const ref = {
    accountId: props.accountId,
    propertyId: props.propertyId,
    bookingId: booking.id,
  };

  return (
    <Card className="bg-card lg:col-span-2" data-test={'villa-guest-emails'}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="text-muted-foreground h-4 w-4" />
          Guest emails
        </CardTitle>
        {canUndo ? <UndoCheckoutButton {...ref} /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!booking.guestEmail ? (
          <p
            className="text-muted-foreground text-sm"
            data-test={'villa-guest-emails-none'}
          >
            {booking.sourceFeedId
              ? `No guest email on this booking, so no emails go out. ${channelName} does not share one; add it here if the guest gave it to you.`
              : 'No guest email on this booking, so no emails go out.'}
          </p>
        ) : null}

        <ul className="divide-border divide-y rounded-lg border">
          {(['booking_confirmation', 'pre_arrival', 'thank_you'] as const).map(
            (t) => {
              const isEnabled = on[t];
              const sendable =
                isEnabled &&
                !blockedForChannelStay(t, booking) &&
                Boolean(booking.guestEmail) &&
                (t === 'booking_confirmation'
                  ? (booking.status === 'confirmed' ||
                      booking.status === 'completed') &&
                    paid
                  : t === 'pre_arrival'
                    ? booking.status === 'confirmed' &&
                      booking.checkIn >= todayIst()
                    : booking.status === 'completed');
              const sentBefore = log.some(
                (l) => l.template === t && l.status === 'sent',
              );

              return (
                <li
                  key={t}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 p-3 transition-opacity',
                    (!isEnabled || blockedForChannelStay(t, booking)) &&
                      'bg-muted/30 opacity-60',
                  )}
                  data-test={`villa-guest-email-${t}`}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        (!isEnabled || blockedForChannelStay(t, booking)) &&
                          'text-muted-foreground',
                      )}
                    >
                      {GUEST_EMAIL_LABELS[t]}
                    </span>
                    <span
                      className="text-muted-foreground text-xs"
                      data-test={`villa-guest-email-${t}-status`}
                    >
                      {status(t)}
                    </span>
                  </div>
                  {sendable ? (
                    <GuestEmailButton
                      {...ref}
                      template={t}
                      again={sentBefore}
                      confirmationInfo={{
                        guestName: booking.guestName,
                        guestEmail: booking.guestEmail ?? '',
                        checkIn: booking.checkIn,
                        checkOut: booking.checkOut,
                      }}
                    />
                  ) : null}
                </li>
              );
            },
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
