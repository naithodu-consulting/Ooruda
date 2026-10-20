import { Suspense } from 'react';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, CircleAlert, Phone } from 'lucide-react';

import { formatPhoneNumber } from '@kit/shared/utils';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';

import pathsConfig from '~/config/paths.config';
import { formatDateReadable, formatTimestampDMY } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { getBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { todayIst } from '~/lib/villa-db/dates';
import { isVillaDbError } from '~/lib/villa-db/errors';
import {
  activityLabel,
  bookingStatusLabel,
  channelLabel,
  idStatusLabel,
  paymentStatusLabel,
} from '~/lib/villa/labels';
import { fromPaise } from '~/lib/villa/money';
import { selectVillaProperty } from '~/lib/villa/properties';

import { TeamAccountLayoutPageHeader } from '../../_components/team-account-layout-page-header';
import { CancelBookingDialog } from '../_components/cancel-booking-dialog';
import { CompleteStayButton } from '../_components/complete-stay-button';
import { GuestEmailsSection } from '../_components/guest-emails-section';
import { GuestIdsSection } from '../_components/guest-ids-section';
import { PaymentsSection } from '../_components/payments-section';

export const metadata = { title: 'Booking' };

interface Props {
  params: Promise<{ account: string; bookingId: string }>;
  searchParams: Promise<{ property?: string }>;
}

export default async function BookingPage({ params, searchParams }: Props) {
  const [{ account, bookingId }, sp] = await Promise.all([
    params,
    searchParams,
  ]);

  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) notFound();

  const { role, accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const client = getSupabaseServerClient();

  const { property } = await selectVillaProperty(accountId, sp.property, {
    requireSite: true,
  });

  if (!property) notFound();

  const propertyId = property.id;
  const back = `${pathsConfig.app.accountVillaBookings.replace('[account]', account)}?property=${propertyId}`;

  // The site read and Ooruda's own reads are independent: run them together.
  const [siteResult, activityResult, reasonsResult, settingsResult] =
    await Promise.all([
      getVillaSite(accountId, propertyId)
        .then((site) => getBooking(site, bookingId))
        .then(
          (booking) => ({ booking, error: null }),
          (error: unknown) => {
            if (!isVillaDbError(error)) throw error;
            return { booking: null, error: error.message };
          },
        ),
      client
        .from('villa_booking_activity')
        .select(
          'id, action, reason_code, note, created_at, villa_cancellation_reasons(label)',
        )
        .eq('property_id', propertyId)
        .eq('site_booking_id', bookingId)
        .order('created_at'),
      client
        .from('villa_cancellation_reasons')
        .select('code, label, initiated_by, note_required')
        .eq('is_active', true)
        .order('display_order'),
      client
        .from('villa_account_settings')
        .select('managers_can_cancel')
        .eq('account_id', accountId)
        .maybeSingle(),
    ]);

  const queryError =
    activityResult.error ?? reasonsResult.error ?? settingsResult.error;

  if (queryError) {
    throw new Error(`booking page: load failed: ${queryError.message}`);
  }

  if (siteResult.error) {
    return (
      <PageBody>
        <Alert variant="destructive" data-test={'villa-booking-site-error'}>
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Booking site unavailable</AlertTitle>
          <AlertDescription>{siteResult.error}</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  const booking = siteResult.booking;

  if (!booking) notFound();

  const activity = activityResult.data;
  const reasons = reasonsResult.data;
  const settings = settingsResult.data;

  const today = todayIst();
  // Only confirmed bookings can be cancelled from here (pending holds lapse
  // on their own).
  const active = booking.status === 'confirmed';
  const canCancel =
    active &&
    (role === 'villa_admin' || Boolean(settings?.managers_can_cancel));
  const canCheckOut =
    booking.status === 'confirmed' && booking.checkIn <= today;
  const guests = booking.adults + booking.children;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={booking.guestName}
        description={
          <AppBreadcrumbs values={{ [bookingId]: booking.guestName }} />
        }
      />

      <div className="flex max-w-4xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={back} />}
            data-test={'villa-booking-back'}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            All bookings
          </Button>

          <div className="flex flex-wrap gap-2">
            {canCheckOut ? (
              <CompleteStayButton
                accountId={accountId}
                propertyId={propertyId}
                bookingId={booking.id}
                guestName={booking.guestName}
              />
            ) : null}
            {canCancel ? (
              <CancelBookingDialog
                accountId={accountId}
                propertyId={propertyId}
                bookingId={booking.id}
                bookingCode={booking.bookingCode}
                reasons={reasons ?? []}
              />
            ) : null}
          </div>
        </div>

        <div
          className="flex flex-wrap gap-2"
          data-test={'villa-booking-badges'}
        >
          <Badge variant="outline" data-test={'villa-booking-status'}>
            {bookingStatusLabel(booking.status)}
          </Badge>
          <Badge variant="outline" data-test={'villa-booking-payment-badge'}>
            {paymentStatusLabel(booking.paymentStatus)}
          </Badge>
          <Badge variant="outline" data-test={'villa-booking-id-status'}>
            {idStatusLabel(booking.idStatus)}
          </Badge>
          <Badge variant="outline">{channelLabel(booking.channel)}</Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-base">Stay</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Check-in</dt>
                <dd>{formatDateReadable(booking.checkIn)}</dd>
                <dt className="text-muted-foreground">Check-out</dt>
                <dd>{formatDateReadable(booking.checkOut)}</dd>
                <dt className="text-muted-foreground">Nights</dt>
                <dd>{booking.nights}</dd>
                <dt className="text-muted-foreground">Guests</dt>
                <dd>
                  {guests} ({booking.adults} adult
                  {booking.adults === 1 ? '' : 's'}
                  {booking.children
                    ? `, ${booking.children} child${booking.children === 1 ? '' : 'ren'}`
                    : ''}
                  )
                  {booking.infants
                    ? ` + ${booking.infants} infant${booking.infants === 1 ? '' : 's'}`
                    : ''}
                </dd>
                {booking.invoiceNumber ? (
                  <>
                    <dt className="text-muted-foreground">Invoice</dt>
                    <dd className="font-mono">{booking.invoiceNumber}</dd>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-base">Guest</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="break-words" data-test={'villa-booking-guest'}>
                  {booking.guestName}
                </dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  {booking.guestPhone ? (
                    <a
                      href={`tel:${booking.guestPhone}`}
                      data-test={'villa-booking-phone'}
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {formatPhoneNumber(booking.guestPhone)}
                    </a>
                  ) : (
                    '-'
                  )}
                </dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">
                  {booking.guestEmail ? (
                    <a
                      href={`mailto:${booking.guestEmail}`}
                      className="text-primary hover:underline"
                    >
                      {booking.guestEmail}
                    </a>
                  ) : (
                    '-'
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Stay</dt>
                <dd className="text-right tabular-nums">
                  {formatINR(fromPaise(booking.baseAmountPaise))}
                </dd>
                {booking.extraGuestAmountPaise ? (
                  <>
                    <dt className="text-muted-foreground">Extra guests</dt>
                    <dd className="text-right tabular-nums">
                      {formatINR(fromPaise(booking.extraGuestAmountPaise))}
                    </dd>
                  </>
                ) : null}
                {booking.discountAmountPaise ? (
                  <>
                    <dt className="text-muted-foreground">
                      Discount
                      {booking.discountCode ? ` (${booking.discountCode})` : ''}
                    </dt>
                    <dd className="text-primary text-right tabular-nums">
                      −{formatINR(fromPaise(booking.discountAmountPaise))}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">GST</dt>
                <dd className="text-right tabular-nums">
                  {formatINR(fromPaise(booking.taxAmountPaise))}
                </dd>
                <dt className="border-t pt-1 font-semibold">Total</dt>
                <dd
                  className="border-t pt-1 text-right font-semibold tabular-nums"
                  data-test={'villa-booking-detail-total'}
                >
                  {formatINR(fromPaise(booking.totalAmountPaise))}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Suspense
            fallback={<Skeleton className="h-40 rounded-xl lg:col-span-2" />}
          >
            <PaymentsSection
              accountId={accountId}
              propertyId={propertyId}
              booking={booking}
              role={role}
            />
          </Suspense>

          <Suspense
            fallback={<Skeleton className="h-40 rounded-xl lg:col-span-2" />}
          >
            <GuestIdsSection
              accountId={accountId}
              propertyId={propertyId}
              booking={booking}
              role={role}
            />
          </Suspense>

          <Suspense
            fallback={<Skeleton className="h-32 rounded-xl lg:col-span-2" />}
          >
            <GuestEmailsSection
              accountId={accountId}
              propertyId={propertyId}
              booking={booking}
              role={role}
            />
          </Suspense>

          <Card className="bg-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activity && activity.length > 0 ? (
                <ol
                  className="flex flex-col gap-3"
                  data-test={'villa-booking-activity'}
                >
                  {activity.map((a) => {
                    const reason = Array.isArray(a.villa_cancellation_reasons)
                      ? a.villa_cancellation_reasons[0]
                      : a.villa_cancellation_reasons;

                    return (
                      <li
                        key={a.id}
                        className="text-sm"
                        data-test={'villa-booking-activity-item'}
                      >
                        <span className="font-medium">
                          {activityLabel(a.action)}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {formatTimestampDMY(a.created_at)}
                        </span>
                        {reason?.label ? <p>Reason: {reason.label}</p> : null}
                        {a.note ? (
                          <p className="text-muted-foreground">{a.note}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Booked on the website. Changes made in Ooruda appear here.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}
