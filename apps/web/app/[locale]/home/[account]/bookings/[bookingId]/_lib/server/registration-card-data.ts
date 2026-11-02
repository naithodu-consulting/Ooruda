import 'server-only';
import {
  type RegistrationCardTemplateKey,
  hasRegistrationCardTemplate,
} from '@kit/pdf-templates/registration-card-templates';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getBooking } from '~/lib/villa-db/bookings';
import { getVillaSite } from '~/lib/villa-db/client';
import { getBaseRates } from '~/lib/villa-db/rates';
import {
  type RegistrationCardInput,
  buildRegistrationCard,
} from '~/lib/villa/registration-card';

/**
 * Everything one booking's registration card prints, gathered from both
 * databases.
 *
 * Six reads across two databases, so they go out together rather than in
 * series: the booking, the property's rates (check-in/out times and the
 * occupancy numbers the house rules quote) and the guest's company details
 * come from the booking site, while the letterhead, the recorded payment
 * modes and the primary guest's ID type are Ooruda's. On a remote database
 * the serial version of this was six round trips before the first byte of
 * PDF. Only `getVillaSite` runs ahead of them, and it is request-cached, so
 * the page has normally resolved it already.
 *
 * Returns null when the booking does not belong to this property, when the
 * stay is not one that is happening, or when the property has no card
 * template this build can render - the caller 404s in every case.
 */
export async function loadRegistrationCardData(options: {
  accountId: string;
  /** villa_properties.id */
  propertyId: string;
  bookingId: string;
}): Promise<{
  template: RegistrationCardTemplateKey;
  data: ReturnType<typeof buildRegistrationCard>;
  /** For the download filename, e.g. "V19-2611-0007". */
  bookingId: string;
} | null> {
  const client = getSupabaseServerClient();

  const site = await getVillaSite(options.accountId, options.propertyId);

  const [
    booking,
    rates,
    siteExtras,
    legalResult,
    paymentsResult,
    primaryResult,
    docsResult,
  ] = await Promise.all([
    getBooking(site, options.bookingId),
    getBaseRates(site),
    // guest_company and guest_gstin are not part of SiteBooking (no other
    // screen needs them), so they are read here rather than widening a
    // type a dozen call sites share.
    site.client
      .from('bookings')
      .select('guest_company, guest_gstin')
      .eq('id', options.bookingId)
      .eq('property_id', site.sitePropertyId)
      .maybeSingle(),
    // Scoped by account as well as id, although RLS and getVillaSite both
    // already cover it: this is the query that decides WHOSE letterhead the
    // guest signs under, and a super-admin passes the role check for every
    // villa account. It must not depend on a check made elsewhere.
    client
      .from('villa_properties')
      .select(
        'name, legal_name, legal_address, gstin, support_email, whatsapp_number, registration_card_template',
      )
      .eq('id', options.propertyId)
      .eq('account_id', options.accountId)
      .maybeSingle(),
    client
      .from('villa_booking_payments')
      .select('mode')
      .eq('property_id', options.propertyId)
      .eq('site_booking_id', options.bookingId)
      // A voided receipt is money that came back; it says nothing about how
      // this stay was paid. Filtered in the query, not after it.
      .is('voided_at', null),
    // The primary guest, and this booking's ID documents. Two reads rather
    // than an embed: the two tables are linked through villa_guests, with
    // no foreign key between them for PostgREST to follow.
    client
      .from('villa_booking_guests')
      .select('guest_id')
      .eq('property_id', options.propertyId)
      .eq('site_booking_id', options.bookingId)
      .eq('is_primary', true)
      // limit(1) rather than maybeSingle(): nothing in the schema forbids two
      // primary rows, and the card would rather name one ID type than error
      // into a blank box.
      .limit(1),
    // Newest first, so a passport shown at the gate wins over an Aadhaar
    // captured when the booking was made.
    client
      .from('villa_guest_documents')
      .select('guest_id, doc_type, purged_at, captured_at, verified_at')
      .eq('property_id', options.propertyId)
      .eq('site_booking_id', options.bookingId)
      .order('captured_at', { ascending: false }),
  ]);

  if (legalResult.error) {
    throw new Error(
      `registration card: property load failed: ${legalResult.error.message}`,
    );
  }

  if (paymentsResult.error) {
    throw new Error(
      `registration card: payments load failed: ${paymentsResult.error.message}`,
    );
  }

  if (siteExtras.error) {
    throw new Error(
      `registration card: booking details load failed: ${siteExtras.error.message}`,
    );
  }

  const property = legalResult.data;

  // Validated here rather than by the caller: a key the database holds but
  // this build has no template for is the same as no card at all.
  const template = property?.registration_card_template;

  if (!booking || !property || !hasRegistrationCardTemplate(template)) {
    return null;
  }

  // The same rule the booking page applies to the button, enforced here too:
  // the route is reachable by URL, and a card for a cancelled or still-pending
  // hold is a check-in document for a stay that is not happening.
  if (!['confirmed', 'completed'].includes(booking.status)) return null;

  // A failed guest read must not block the card: the ID type is one optional
  // box on a form the guest completes by hand anyway. The primary guest only -
  // the card carries one name and one signature.
  const primaryGuestId = primaryResult.error
    ? null
    : (primaryResult.data?.[0]?.guest_id ?? null);

  const docs =
    docsResult.error || !primaryGuestId
      ? []
      : (docsResult.data ?? []).filter(
          (doc) => doc.guest_id === primaryGuestId && !doc.purged_at,
        );

  // A verified document is the one staff actually checked; otherwise the most
  // recently captured.
  const govtIdType =
    (docs.find((doc) => doc.verified_at) ?? docs[0])?.doc_type ?? null;

  const input: RegistrationCardInput = {
    legal: {
      villaName: property.name,
      legalName: property.legal_name,
      legalAddress: property.legal_address,
      gstin: property.gstin,
      supportEmail: property.support_email,
      whatsappNumber: property.whatsapp_number,
    },
    booking,
    rules: {
      checkInTime: rates.checkInTime,
      checkOutTime: rates.checkOutTime,
      includedGuests: rates.includedGuests,
      maxGuests: rates.maxGuests,
    },
    company: siteExtras.data?.guest_company ?? null,
    guestGstin: siteExtras.data?.guest_gstin ?? null,
    govtIdType,
    paymentModes: (paymentsResult.data ?? []).map((payment) => payment.mode),
  };

  return {
    template,
    data: buildRegistrationCard(input),
    bookingId: booking.bookingCode ?? booking.referenceNumber,
  };
}
