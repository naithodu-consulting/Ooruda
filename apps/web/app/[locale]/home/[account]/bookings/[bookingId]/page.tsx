import { Suspense } from 'react';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, CircleAlert, IndianRupee, Phone } from 'lucide-react';

import { hasRegistrationCardTemplate } from '@kit/pdf-templates/registration-card-templates';
import { formatPhoneNumber } from '@kit/shared/utils';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { cn } from '@kit/ui/utils';

import pathsConfig from '~/config/paths.config';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { getBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { todayIst } from '~/lib/villa-db/dates';
import { isVillaDbError } from '~/lib/villa-db/errors';
import {
  bookingStatusLabel,
  channelLabel,
  idStatusLabel,
  paymentStatusLabel,
} from '~/lib/villa/labels';
import { fromPaise } from '~/lib/villa/money';
import { selectVillaProperty } from '~/lib/villa/properties';
import { loadVillaAccountSettings } from '~/lib/villa/settings';

import { TeamAccountLayoutPageHeader } from '../../_components/team-account-layout-page-header';
import { CancelBookingDialog } from '../_components/cancel-booking-dialog';
import { CompleteStayButton } from '../_components/complete-stay-button';
import { GuestEmailsSection } from '../_components/guest-emails-section';
import { GuestIdsSection } from '../_components/guest-ids-section';
import { PaymentsSection } from '../_components/payments-section';
import { RegistrationCardButton } from '../_components/registration-card-button';

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

  // The cancellation reasons and this account's settings depend on neither
  // the property nor the booking, so all three start at once instead of
  // three serial round trips. The site read then needs the property, so it is
  // chained onto that one promise rather than awaited on its own.
  const [{ property }, reasonsResult, settings] = await Promise.all([
    selectVillaProperty(accountId, sp.property, { requireSite: true }),
    client
      .from('villa_cancellation_reasons')
      .select('code, label, initiated_by, note_required')
      .eq('is_active', true)
      .order('display_order'),
    loadVillaAccountSettings(accountId),
  ]);

  if (!property) notFound();

  const propertyId = property.id;
  const back = `${pathsConfig.app.accountVillaBookings.replace('[account]', account)}?property=${propertyId}`;

  const siteResult = await getVillaSite(accountId, propertyId)
    .then((site) => getBooking(site, bookingId))
    .then(
      (booking) => ({ booking, error: null }),
      (error: unknown) => {
        if (!isVillaDbError(error)) throw error;
        return { booking: null, error: error.message };
      },
    );

  if (reasonsResult.error) {
    throw new Error(
      `booking page: load failed: ${reasonsResult.error.message}`,
    );
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

  const reasons = reasonsResult.data;

  const today = todayIst();
  // Only confirmed bookings can be cancelled from here (pending holds lapse
  // on their own).
  const active = booking.status === 'confirmed';
  const canCancel =
    active &&
    today <= booking.checkIn &&
    (role === 'villa_admin' || settings.managersCanCancel);
  const canCheckOut =
    booking.status === 'confirmed' && booking.checkIn <= today;
  // The card is the villa's own sheet, printed for a stay that is happening:
  // a cancelled booking has no check-in, and a villa with no template of its
  // own offers no download at all rather than a generic form.
  const canDownloadCard =
    ['confirmed', 'completed'].includes(booking.status) &&
    hasRegistrationCardTemplate(property.registrationCardTemplate);
  const guests = booking.adults + booking.children;
  const bookingTitle =
    booking.bookingCode ?? booking.referenceNumber ?? booking.guestName;
  const subtotalPaise =
    booking.baseAmountPaise +
    booking.extraGuestAmountPaise -
    booking.discountAmountPaise;
  const hasMultipleBaseLines =
    Boolean(booking.extraGuestAmountPaise) ||
    Boolean(booking.discountAmountPaise);
  const perNightRate =
    booking.nights > 0
      ? fromPaise(booking.baseAmountPaise) / booking.nights
      : 0;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={bookingTitle}
        description={<AppBreadcrumbs values={{ [bookingId]: bookingTitle }} />}
      />

      <div className="flex max-w-4xl flex-col gap-4">
        <Link
          href={back}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm font-medium transition-colors"
          data-test={'villa-booking-back'}
        >
          <ArrowLeft className="h-4 w-4" />
          All bookings
        </Link>

        {/*
          The status badges and the two actions share one bar inside the
          content column. Keeping the actions in the page header left them
          floating against the far right edge, past where the column ends,
          so they read as chrome rather than as this booking's actions.
        */}
        <div className="bg-card flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              data-test={'villa-booking-status'}
              className={cn(
                booking.status === 'cancelled' &&
                  'border-destructive/40 text-destructive',
                booking.status === 'confirmed' &&
                  'border-success/40 text-success',
              )}
            >
              {bookingStatusLabel(booking.status)}
            </Badge>

            <Badge
              variant="outline"
              data-test={'villa-booking-payment-badge'}
              className={cn(
                booking.paymentStatus === 'paid' &&
                  'border-success/40 text-success',
                booking.paymentStatus === 'unpaid' &&
                  booking.status === 'confirmed' &&
                  'border-warning/40 text-warning',
              )}
            >
              {booking.paymentStatus === 'partially_paid'
                ? 'Part paid'
                : paymentStatusLabel(booking.paymentStatus)}
            </Badge>

            <Badge
              variant="outline"
              data-test={'villa-booking-id-status'}
              className={cn(
                booking.idStatus === 'verified' &&
                  'border-success/40 text-success',
              )}
            >
              {idStatusLabel(booking.idStatus)}
            </Badge>
          </div>

          {canCheckOut || canCancel || canDownloadCard ? (
            <div
              className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1"
              data-test={'villa-booking-actions'}
            >
              {canCheckOut ? (
                <CompleteStayButton
                  accountId={accountId}
                  propertyId={propertyId}
                  bookingId={booking.id}
                  guestName={booking.guestName}
                />
              ) : null}
              {canDownloadCard ? (
                <RegistrationCardButton
                  accountId={accountId}
                  propertyId={propertyId}
                  bookingId={booking.id}
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
          ) : null}
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
                <dt className="text-muted-foreground">Channel</dt>
                <dd>{channelLabel(booking.channel)}</dd>
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
                  {booking.salutation ? `${booking.salutation} ` : ''}
                  {booking.guestName}
                </dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  {booking.guestPhone ? (
                    <a
                      href={`tel:${booking.guestPhone}`}
                      data-test={'villa-booking-phone'}
                      className="text-brand-ink inline-flex items-center gap-1 font-medium hover:underline"
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
                      className="text-brand-ink font-medium hover:underline"
                    >
                      {booking.guestEmail}
                    </a>
                  ) : (
                    '-'
                  )}
                </dd>
                {booking.specialRequests ? (
                  <>
                    <dt className="text-muted-foreground">Special requests</dt>
                    <dd
                      className="border-warning/30 bg-warning/5 text-warning rounded-md border p-2 text-sm"
                      data-test={'villa-booking-special-requests'}
                    >
                      {booking.specialRequests}
                    </dd>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-card lg:col-span-2">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <IndianRupee className="text-muted-foreground h-4 w-4" />
                Amount
              </CardTitle>
              <span className="text-muted-foreground text-xs">
                {booking.nights} {booking.nights === 1 ? 'night' : 'nights'} ·{' '}
                {guests} {guests === 1 ? 'guest' : 'guests'}
              </span>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Summary KPI tiles */}
              <dl
                className={cn(
                  'grid grid-cols-2 gap-3',
                  booking.discountAmountPaise > 0
                    ? 'sm:grid-cols-4'
                    : 'sm:grid-cols-3',
                )}
              >
                <div className="rounded-lg border p-3">
                  <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Taxable amount
                  </dt>
                  <dd className="text-lg font-bold tabular-nums">
                    {formatINR(fromPaise(subtotalPaise))}
                  </dd>
                </div>
                {booking.discountAmountPaise > 0 ? (
                  <div className="rounded-lg border p-3">
                    <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Discount
                      {booking.discountCode ? ` (${booking.discountCode})` : ''}
                    </dt>
                    <dd className="text-success text-lg font-bold tabular-nums">
                      −{formatINR(fromPaise(booking.discountAmountPaise))}
                    </dd>
                  </div>
                ) : null}
                <div className="rounded-lg border p-3">
                  <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    GST
                  </dt>
                  <dd className="text-lg font-bold tabular-nums">
                    {formatINR(fromPaise(booking.taxAmountPaise))}
                  </dd>
                </div>
                <div className="bg-muted/30 rounded-lg border p-3">
                  <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Total payable
                  </dt>
                  <dd
                    className="text-lg font-bold tabular-nums"
                    data-test={'villa-booking-detail-total'}
                  >
                    {formatINR(fromPaise(booking.totalAmountPaise))}
                  </dd>
                </div>
              </dl>

              {/* Itemized breakdown */}
              <div className="divide-border divide-y rounded-lg border text-sm">
                <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">Stay tariff</span>
                    <span className="text-muted-foreground text-xs">
                      {booking.nights}{' '}
                      {booking.nights === 1 ? 'night' : 'nights'}
                      {perNightRate > 0 && Number.isInteger(perNightRate)
                        ? ` × ${formatINR(perNightRate)}/night`
                        : ''}
                    </span>
                  </div>
                  <span className="font-medium tabular-nums">
                    {formatINR(fromPaise(booking.baseAmountPaise))}
                  </span>
                </div>

                {booking.extraGuestAmountPaise ? (
                  <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                    <span className="font-medium">Extra guest charges</span>
                    <span className="font-medium tabular-nums">
                      {formatINR(fromPaise(booking.extraGuestAmountPaise))}
                    </span>
                  </div>
                ) : null}

                {booking.discountAmountPaise ? (
                  <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Discount applied</span>
                      {booking.discountCode ? (
                        <Badge
                          variant="outline"
                          className="font-mono text-xs uppercase"
                        >
                          {booking.discountCode}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-success font-medium tabular-nums">
                      −{formatINR(fromPaise(booking.discountAmountPaise))}
                    </span>
                  </div>
                ) : null}

                {hasMultipleBaseLines ? (
                  <div className="bg-muted/20 flex items-center justify-between gap-4 px-3.5 py-2">
                    <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Taxable subtotal (before GST)
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(fromPaise(subtotalPaise))}
                    </span>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                  <span className="text-muted-foreground">GST</span>
                  <span className="tabular-nums">
                    {formatINR(fromPaise(booking.taxAmountPaise))}
                  </span>
                </div>

                <div className="bg-muted/30 flex items-center justify-between gap-4 px-3.5 py-2.5 font-semibold">
                  <span>Total</span>
                  <span className="text-base tabular-nums">
                    {formatINR(fromPaise(booking.totalAmountPaise))}
                  </span>
                </div>
              </div>
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
        </div>
      </div>
    </PageBody>
  );
}
