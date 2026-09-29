import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import { getLogger } from '@kit/shared/logger';
import { normalizePhoneNumber } from '@kit/shared/utils';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { Database } from '~/lib/database.types';
import { getBooking, setIdStatus } from '~/lib/villa-db/bookings';
import { type VillaSite, getVillaSite } from '~/lib/villa-db/client';
import { VillaDbError } from '~/lib/villa-db/errors';
import { guestIdUploadsEnabled } from '~/lib/villa/flags';
import { GUEST_DOCS_BUCKET, recordIdAccess } from '~/lib/villa/guest-id-access';
import {
  ID_FILE_MAX_BYTES,
  idPurgeDate,
  maskIdNumber,
  sniffIdFileType,
} from '~/lib/villa/guest-ids';
import { mirrorBooking } from '~/lib/villa/mirror';

import type {
  AddGuestSchema,
  DeleteIdSchema,
  IdStatusSchema,
  RecordIdSchema,
  RemoveGuestSchema,
} from '../schemas/guests.schema';

type Client = SupabaseClient<Database>;

/** Signed links to an ID file live this long. */
const SIGNED_URL_SECONDS = 60;

/** A refusal written for the user; anything else is shown generically. */
export class GuestIdError extends Error {}

/**
 * Guests on a booking and their ID documents. Callers authorise the villa
 * role first. Members can only READ these tables: every write goes through
 * the service role here, always filtered by the caller's account, after the
 * booking is checked on the site. The member's own client (`client`) is used
 * where RLS itself should decide (opening a file).
 */
export function createGuestsService(client: Client) {
  const db = getSupabaseServerAdminClient();

  async function liveBooking(site: VillaSite, bookingId: string) {
    const booking = await getBooking(site, bookingId);

    if (!booking) throw new VillaDbError('NOT_FOUND', `booking ${bookingId}`);

    if (!['confirmed', 'completed'].includes(booking.status)) {
      throw new VillaDbError(
        'CONFLICT',
        `booking ${bookingId} is ${booking.status}`,
        'Guests and IDs can be added only to a confirmed stay.',
      );
    }

    return booking;
  }

  /** The chosen register entry, or a new/deduplicated one by phone. */
  async function resolveGuest(
    accountId: string,
    input: { guestId: string; newGuestName: string; newGuestPhone: string },
    actor: string,
  ): Promise<string> {
    if (input.guestId) {
      const { data, error } = await db
        .from('villa_guests')
        .select('id')
        .eq('id', input.guestId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (error) throw new GuestIdError('Could not load the guest.');
      if (!data) throw new GuestIdError('That guest no longer exists.');

      return data.id;
    }

    const phone = input.newGuestPhone
      ? normalizePhoneNumber(input.newGuestPhone)
      : null;

    // One guest per phone number per villa account: a returning guest is
    // the same register entry.
    if (phone) {
      const { data: existing, error } = await db
        .from('villa_guests')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', phone)
        .maybeSingle();

      if (error) throw new GuestIdError('Could not look up the guest.');
      if (existing) return existing.id;
    }

    const { data, error } = await db
      .from('villa_guests')
      .insert({
        account_id: accountId,
        full_name: input.newGuestName,
        phone,
        created_by: actor,
      })
      .select('id')
      .single();

    if (error) {
      // Lost a race with someone adding the same phone: use theirs.
      if (error.code === '23505' && phone) {
        const { data: raced } = await db
          .from('villa_guests')
          .select('id')
          .eq('account_id', accountId)
          .eq('phone', phone)
          .maybeSingle();

        if (raced) return raced.id;
      }

      throw new GuestIdError('Could not add the guest.');
    }

    return data.id;
  }

  async function linkGuest(
    input: {
      accountId: string;
      propertyId: string;
      bookingId: string;
      isAdult: boolean;
    },
    guestId: string,
  ) {
    // Two tries: a concurrent add can take the lead-guest slot between the
    // read and the insert (one_primary index), in which case this guest is
    // added again as a non-lead guest.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: links, error: linksError } = await db
        .from('villa_booking_guests')
        .select('guest_id, is_primary')
        .eq('account_id', input.accountId)
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId);

      if (linksError) {
        throw new GuestIdError('Could not load the booking guests.');
      }

      if (links?.some((l) => l.guest_id === guestId)) return;

      const { error } = await db.from('villa_booking_guests').insert({
        account_id: input.accountId,
        property_id: input.propertyId,
        site_booking_id: input.bookingId,
        guest_id: guestId,
        is_adult: input.isAdult,
        // The first guest recorded is the lead guest.
        is_primary: attempt === 0 && !links?.some((l) => l.is_primary),
      });

      if (!error) return;
      if (error.code !== '23505') break;
      // 23505: this guest was added meanwhile, or the lead slot was taken.
      // Re-read and retry.
    }

    const { data: linked } = await db
      .from('villa_booking_guests')
      .select('id')
      .eq('account_id', input.accountId)
      .eq('property_id', input.propertyId)
      .eq('site_booking_id', input.bookingId)
      .eq('guest_id', guestId)
      .maybeSingle();

    // Never go on to save an ID for a guest who is not on the booking.
    if (!linked) {
      throw new GuestIdError('Could not add the guest to this booking.');
    }
  }

  /** Keeps the guest's booking page truthful; the ID is saved either way. */
  async function markReceived(
    site: VillaSite,
    bookingId: string,
    actor: string,
  ) {
    try {
      const booking = await setIdStatus(site, bookingId, 'received', actor);
      await mirrorBooking(site, booking);
    } catch (error) {
      (await getLogger()).warn(
        { bookingId, error: String(error) },
        'villa id_status write-back failed',
      );
    }
  }

  return {
    async addGuest(input: z.output<typeof AddGuestSchema>, actor: string) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      await liveBooking(site, input.bookingId);

      const guestId = await resolveGuest(input.accountId, input, actor);
      await linkGuest(input, guestId);

      return { guestId };
    },

    async removeGuest(input: z.output<typeof RemoveGuestSchema>) {
      const { count, error: docsError } = await db
        .from('villa_guest_documents')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', input.accountId)
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId)
        .eq('guest_id', input.guestId)
        .is('purged_at', null);

      if (docsError) throw new GuestIdError('Could not check the guest’s IDs.');

      if (count) {
        throw new GuestIdError(
          'This guest has ID documents on this booking. Delete those first.',
        );
      }

      const { data, error } = await db
        .from('villa_booking_guests')
        .delete()
        .eq('account_id', input.accountId)
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId)
        .eq('guest_id', input.guestId)
        .select('id');

      if (error) throw new GuestIdError('Could not remove the guest.');
      if (!data?.length)
        throw new GuestIdError('That guest is not on this booking.');
    },

    /**
     * Records an ID: with a file (`soft_copy`, only while uploads are
     * enabled) or as seen in person at the villa (no file).
     */
    async recordId(
      input: z.output<typeof RecordIdSchema>,
      file: File | null,
      actor: string,
    ) {
      const masked = maskIdNumber(input.docType, input.idNumber);
      if (!masked.ok) throw new GuestIdError(masked.message);

      let bytes: Uint8Array | null = null;
      let contentType: ReturnType<typeof sniffIdFileType> = null;

      if (input.stage === 'soft_copy') {
        if (!guestIdUploadsEnabled()) {
          throw new GuestIdError(
            'Storing ID files is not switched on yet. Record the ID as seen in person.',
          );
        }

        if (!file || file.size === 0)
          throw new GuestIdError('Attach the ID photo.');
        if (file.size > ID_FILE_MAX_BYTES) {
          throw new GuestIdError('The file is larger than 10 MB.');
        }

        bytes = new Uint8Array(await file.arrayBuffer());
        contentType = sniffIdFileType(bytes.subarray(0, 16));

        if (!contentType) {
          throw new GuestIdError('Use a JPEG, PNG or WebP photo, or a PDF.');
        }
      }

      const admin = getSupabaseServerAdminClient();
      const site = await getVillaSite(input.accountId, input.propertyId);

      const [booking, { data: property, error: propertyError }] =
        await Promise.all([
          liveBooking(site, input.bookingId),
          admin
            .from('villa_properties')
            .select('retention_days')
            .eq('id', input.propertyId)
            .eq('account_id', input.accountId)
            .single(),
        ]);

      if (propertyError) throw new GuestIdError('Could not load the villa.');

      const guestId = await resolveGuest(input.accountId, input, actor);
      await linkGuest(input, guestId);

      const documentId = crypto.randomUUID();
      const path = bytes
        ? `${input.accountId}/${input.propertyId}/${input.bookingId}/${documentId}`
        : null;

      if (bytes && path && contentType) {
        const { error: uploadError } = await admin.storage
          .from(GUEST_DOCS_BUCKET)
          .upload(path, bytes, { contentType, upsert: false });

        if (uploadError) {
          (await getLogger()).error(
            { bookingId: input.bookingId, error: uploadError.message },
            'villa guest id upload failed',
          );
          throw new GuestIdError(
            'Could not save the ID photo. Please try again.',
          );
        }
      }

      const { error: insertError } = await admin
        .from('villa_guest_documents')
        .insert({
          id: documentId,
          account_id: input.accountId,
          property_id: input.propertyId,
          site_booking_id: input.bookingId,
          guest_id: guestId,
          doc_type: input.docType,
          masked_number: masked.masked,
          stage: input.stage,
          storage_path: path,
          content_type: contentType,
          captured_by: actor,
          purge_after: idPurgeDate(booking.checkOut, property.retention_days),
        });

      if (insertError) {
        // Never leave an untracked ID file in storage.
        if (path) {
          const { error: cleanupError } = await admin.storage
            .from(GUEST_DOCS_BUCKET)
            .remove([path]);

          if (cleanupError) {
            (await getLogger()).error(
              { path, error: cleanupError.message },
              'villa guest id orphan file: cleanup failed, remove by hand',
            );
          }
        }

        (await getLogger()).error(
          { bookingId: input.bookingId, code: insertError.code },
          'villa guest id record failed',
        );
        throw new GuestIdError('Could not save the ID. Please try again.');
      }

      await recordIdAccess([
        {
          accountId: input.accountId,
          documentId,
          action: path ? 'uploaded' : 'recorded',
          actor,
        },
      ]);
      await markReceived(site, input.bookingId, actor);

      return { documentId };
    },

    /** The booking's ID status on the guest site (WhatsApp flow included). */
    async setStatus(input: z.output<typeof IdStatusSchema>, actor: string) {
      const site = await getVillaSite(input.accountId, input.propertyId);
      const booking = await setIdStatus(
        site,
        input.bookingId,
        input.status,
        actor,
      );
      await mirrorBooking(site, booking);

      if (input.status === 'verified') {
        const { data, error } = await getSupabaseServerAdminClient()
          .from('villa_guest_documents')
          .update({ verified_by: actor, verified_at: new Date().toISOString() })
          .eq('account_id', input.accountId)
          .eq('property_id', input.propertyId)
          .eq('site_booking_id', input.bookingId)
          .is('verified_at', null)
          .is('purged_at', null)
          .select('id');

        if (error) {
          (await getLogger()).error(
            { bookingId: input.bookingId, code: error.code },
            'villa guest id verify stamp failed',
          );
        }

        await recordIdAccess(
          (data ?? []).map((d) => ({
            accountId: input.accountId,
            documentId: d.id,
            action: 'verified' as const,
            actor,
          })),
        );
      }

      return booking;
    },

    /** Owner only (checked by the caller): removes the file now. */
    async deleteId(input: z.output<typeof DeleteIdSchema>, actor: string) {
      const admin = getSupabaseServerAdminClient();

      const { data: doc, error } = await admin
        .from('villa_guest_documents')
        .select('id, storage_path, stage, purged_at')
        .eq('id', input.documentId)
        .eq('account_id', input.accountId)
        .maybeSingle();

      if (error) throw new GuestIdError('Could not load the ID.');
      if (!doc || doc.purged_at)
        throw new GuestIdError('That ID is already deleted.');

      if (doc.storage_path) {
        const { error: removeError } = await admin.storage
          .from(GUEST_DOCS_BUCKET)
          .remove([doc.storage_path]);

        if (removeError)
          throw new GuestIdError('Could not delete the ID photo.');
      }

      // Tombstone: the record of what was held (type, masked number, who,
      // when) stays; the file is gone.
      const { error: updateError } = await admin
        .from('villa_guest_documents')
        .update({ storage_path: null, purged_at: new Date().toISOString() })
        .eq('id', doc.id);

      if (updateError) throw new GuestIdError('Could not delete the ID.');

      await recordIdAccess([
        {
          accountId: input.accountId,
          documentId: doc.id,
          action: 'deleted',
          actor,
        },
      ]);
    },

    /**
     * A 60-second link to an ID file, after the caller authorised the role.
     * The member's own client proves they can see the record (RLS); the
     * admin client then signs, because members have no storage access.
     */
    async viewUrl(
      accountId: string,
      documentId: string,
      actor: string,
    ): Promise<string> {
      const { data: doc, error } = await client
        .from('villa_guest_documents')
        .select('id, account_id, storage_path, purged_at')
        .eq('id', documentId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (error) throw new GuestIdError('Could not load the ID.');
      if (!doc || !doc.storage_path || doc.purged_at) {
        throw new VillaDbError('NOT_FOUND', `document ${documentId}`);
      }

      // No record, no view.
      const recorded = await recordIdAccess([
        { accountId, documentId: doc.id, action: 'viewed', actor },
      ]);

      if (!recorded)
        throw new GuestIdError('Could not open the ID. Please try again.');

      const { data, error: signError } = await getSupabaseServerAdminClient()
        .storage.from(GUEST_DOCS_BUCKET)
        .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);

      if (signError || !data?.signedUrl) {
        throw new GuestIdError('Could not open the ID.');
      }

      return data.signedUrl;
    },
  };
}
