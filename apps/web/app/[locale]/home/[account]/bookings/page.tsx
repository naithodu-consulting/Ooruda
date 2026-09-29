import { redirect } from 'next/navigation';

import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { normalizeBookingCode } from '~/lib/villa-db/booking-code';
import {
  type BookingView,
  type SiteBooking,
  getBookingByCode,
  listBookingsByView,
  searchBookings,
} from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { isVillaDbError } from '~/lib/villa-db/errors';
import { selectVillaProperty } from '~/lib/villa/properties';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { BookingsList } from './_components/bookings-list';
import { BookingsToolbar } from './_components/bookings-toolbar';
import { NewBookingDialog } from './_components/new-booking-dialog';

export const metadata = { title: 'Bookings' };

const VIEWS: BookingView[] = ['upcoming', 'in_house', 'past', 'cancelled'];
const LIST_LIMIT = 100;

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ view?: string; q?: string; property?: string }>;
}

export default async function BookingsPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const view: BookingView = VIEWS.includes(sp.view as BookingView)
    ? (sp.view as BookingView)
    : 'upcoming';
  const q = sp.q?.trim() ?? '';

  const { accountId } = await requireRole(account, VILLA_ROLES, 'villa');

  const { properties, property } = await selectVillaProperty(
    accountId,
    sp.property,
    { requireSite: true },
  );
  const base = pathsConfig.app.accountVillaBookings.replace(
    '[account]',
    account,
  );

  let bookings: SiteBooking[] = [];
  let siteError: string | null = null;
  let jumpTo: string | null = null;

  if (property) {
    try {
      const site = await getVillaSite(accountId, property.id);

      // A booking code (typed any way) opens that booking; any other text is
      // searched on the site across every status.
      const code = q ? normalizeBookingCode(q) : null;

      const [found, list] = await Promise.all([
        code ? getBookingByCode(site, code) : Promise.resolve(null),
        q
          ? searchBookings(site, q)
          : listBookingsByView(site, view, LIST_LIMIT),
      ]);

      if (found) {
        jumpTo = `${base}/${found.id}?property=${property.id}`;
      } else {
        bookings = list;
      }
    } catch (error) {
      if (!isVillaDbError(error)) throw error;
      siteError = error.message;
    }
  }

  // Outside the try: redirect() works by throwing.
  if (jumpTo) redirect(jumpTo);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.nav.bookings'} />}
        description={<AppBreadcrumbs />}
      >
        {property && !siteError ? (
          <NewBookingDialog
            accountId={accountId}
            propertyId={property.id}
            account={account}
          />
        ) : null}
      </TeamAccountLayoutPageHeader>

      <div className="flex max-w-5xl flex-col gap-4">
        {!property ? (
          <Alert data-test={'villa-bookings-no-property'}>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>No booking site connected</AlertTitle>
            <AlertDescription>
              Bookings appear here once Ooruda support connects your villa to
              its booking site.
            </AlertDescription>
          </Alert>
        ) : siteError ? (
          <Alert variant="destructive" data-test={'villa-bookings-site-error'}>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Booking site unavailable</AlertTitle>
            <AlertDescription>{siteError}</AlertDescription>
          </Alert>
        ) : (
          <>
            <BookingsToolbar
              account={account}
              view={view}
              q={q}
              propertyId={property.id}
              properties={properties.map((p) => ({ id: p.id, name: p.name }))}
            />
            <BookingsList
              account={account}
              propertyId={property.id}
              bookings={bookings}
              view={view}
              searching={Boolean(q)}
              truncated={!q && bookings.length >= LIST_LIMIT}
            />
          </>
        )}
      </div>
    </PageBody>
  );
}
