import { normalizePhoneNumber } from '@kit/shared/utils';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import type { VillaRole } from '~/lib/roles';
import type { SiteBooking } from '~/lib/villa-db/bookings';
import { guestIdUploadsEnabled } from '~/lib/villa/flags';

import { type GuestDoc, type GuestRow, GuestIdsPanel } from './guest-ids-panel';

/**
 * Guests and their ID documents for one booking. Loads its own data (inside
 * Suspense on the booking page). Only what the screen needs reaches the
 * browser: never a storage path, never a full ID number (none is stored).
 */
export async function GuestIdsSection(props: {
  accountId: string;
  propertyId: string;
  booking: SiteBooking;
  role: VillaRole;
}) {
  const client = getSupabaseServerClient();
  const { booking } = props;

  const [linksResult, docsResult, propertyResult] = await Promise.all([
    client
      .from('villa_booking_guests')
      .select('guest_id, is_primary, is_adult, villa_guests(full_name, phone)')
      .eq('property_id', props.propertyId)
      .eq('site_booking_id', booking.id)
      .order('created_at'),
    client
      .from('villa_guest_documents')
      .select(
        'id, guest_id, doc_type, masked_number, stage, storage_path, purged_at, purge_after, captured_at, verified_at',
      )
      .eq('property_id', props.propertyId)
      .eq('site_booking_id', booking.id)
      .order('captured_at'),
    client
      .from('villa_properties')
      .select('whatsapp_number')
      .eq('id', props.propertyId)
      .single(),
  ]);

  const error = linksResult.error ?? docsResult.error ?? propertyResult.error;

  if (error) throw new Error(`guest ids: load failed: ${error.message}`);

  const guests: GuestRow[] = (linksResult.data ?? []).map((l) => {
    const g = Array.isArray(l.villa_guests)
      ? l.villa_guests[0]
      : l.villa_guests;

    return {
      id: l.guest_id,
      name: g?.full_name ?? 'Guest',
      phone: g?.phone ?? null,
      isPrimary: l.is_primary,
      isAdult: l.is_adult,
    };
  });

  const docs: GuestDoc[] = (docsResult.data ?? []).map((d) => ({
    id: d.id,
    guestId: d.guest_id,
    docType: d.doc_type,
    maskedNumber: d.masked_number,
    stage: d.stage as GuestDoc['stage'],
    hasFile: Boolean(d.storage_path) && !d.purged_at,
    purgedAt: d.purged_at,
    purgeAfter: d.purge_after,
    capturedAt: d.captured_at,
    verified: Boolean(d.verified_at),
  }));

  return (
    <GuestIdsPanel
      accountId={props.accountId}
      propertyId={props.propertyId}
      bookingId={booking.id}
      bookingCode={booking.bookingCode}
      bookingGuestName={booking.guestName}
      bookingGuestPhone={
        booking.guestPhone ? normalizePhoneNumber(booking.guestPhone) : null
      }
      adults={booking.adults}
      idStatus={booking.idStatus}
      editable={['confirmed', 'completed'].includes(booking.status)}
      isOwner={props.role === 'villa_admin'}
      uploadsEnabled={guestIdUploadsEnabled()}
      businessWhatsApp={propertyResult.data?.whatsapp_number ?? null}
      guests={guests}
      docs={docs}
    />
  );
}
