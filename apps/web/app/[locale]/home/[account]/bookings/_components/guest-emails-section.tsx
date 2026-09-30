import { Mail } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

import type { SiteBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { todayIst } from '~/lib/villa-db/dates';
import { getBaseRates } from '~/lib/villa-db/rates';
import {
  GUEST_EMAIL_LABELS,
  type GuestEmailTemplate,
  THANK_YOU_DELAY_HOURS,
  preArrivalWindow,
} from '~/lib/villa/guest-emails';

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
}) {
  const client = getSupabaseServerClient();
  const { booking } = props;

  const [rates, logResult, settingsResult, lastResult] = await Promise.all([
    getVillaSite(props.accountId, props.propertyId).then(getBaseRates),
    client
      .from('villa_message_log')
      .select(
        'template, manual, status, reason, check_in, created_at, updated_at',
      )
      .eq('property_id', props.propertyId)
      .eq('site_booking_id', booking.id)
      .order('created_at'),
    client
      .from('villa_account_settings')
      .select('pre_arrival_email, thank_you_email')
      .eq('account_id', props.accountId)
      .maybeSingle(),
    client
      .from('villa_booking_activity')
      .select('action, created_at')
      .eq('property_id', props.propertyId)
      .eq('site_booking_id', booking.id)
      .in('action', ['completed', 'reopened'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const error = logResult.error ?? settingsResult.error ?? lastResult.error;
  if (error) throw new Error('Could not load the guest emails.');

  const log = logResult.data ?? [];
  const on = {
    pre_arrival: settingsResult.data?.pre_arrival_email ?? true,
    thank_you: settingsResult.data?.thank_you_email ?? true,
  };
  const checkedOutAt =
    lastResult.data?.action === 'completed'
      ? new Date(lastResult.data.created_at)
      : null;
  const canUndo =
    booking.status === 'completed' &&
    !booking.invoiceNumber &&
    checkedOutAt !== null &&
    Date.now() - checkedOutAt.getTime() < 24 * 3_600_000;

  function status(template: GuestEmailTemplate): string {
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
    if (auto?.status === 'skipped')
      return `Not sent: ${auto.reason ?? 'skipped'}.${extra}`;
    if (auto?.status === 'failed') {
      return `Could not be sent (${auto.reason ?? 'error'}). Use Send now to try again.${extra}`;
    }
    if (auto?.status === 'sending') {
      return Date.now() - Date.parse(auto.updated_at) > 10 * 60_000
        ? `Delivery unknown (the send was interrupted). Check with the guest before using Send now.${extra}`
        : `Sending now.${extra}`;
    }
    if (!on[template]) return `Switched off in Villa Settings.${extra}`;

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
            No guest email on this booking, so no emails go out.
          </p>
        ) : null}

        <ul className="divide-border divide-y rounded-lg border">
          {(['pre_arrival', 'thank_you'] as const).map((t) => {
            const sendable =
              Boolean(booking.guestEmail) &&
              (t === 'pre_arrival'
                ? booking.status === 'confirmed' &&
                  booking.checkIn >= todayIst()
                : booking.status === 'completed');
            const sentBefore = log.some(
              (l) => l.template === t && l.status === 'sent',
            );

            return (
              <li
                key={t}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3"
                data-test={`villa-guest-email-${t}`}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">
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
                  <GuestEmailButton {...ref} template={t} again={sentBefore} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
