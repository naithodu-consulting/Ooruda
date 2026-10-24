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
  MarkDocVerifiedSchema,
  RecordIdSchema,
  RemoveGuestSchema,
} from '../schemas/guests.schema';

type Client = SupabaseClient<Database>;

/** Signed links to an ID file live this long. */
const SIGNED_URL_SECONDS = 60;

/** Storage paths carry no extension, so the stored MIME type names the file. */
export function extFromMime(mime: string | null): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'jpg';
  }
}

/** A refusal written for the user; anything else is shown generically. */
export class GuestIdError extends Error {}

/** One parsed file from the multipart upload. */
export interface UploadedFile {
  file: File;
  label: string | null; // 'front' | 'back' | null
}

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

  /**
   * Validates and reads up to 4 files from the multipart form.
   * Files come as `file_0`, `file_1`, … with optional `label_0`, `label_1`, …
   */
  async function parseUploadedFiles(
    form: FormData,
    maxFiles = 4,
  ): Promise<UploadedFile[]> {
    if (!guestIdUploadsEnabled()) {
      throw new GuestIdError(
        'Storing ID files is not switched on yet. Record the ID as seen in person.',
      );
    }

    const files: UploadedFile[] = [];

    for (let i = 0; i < maxFiles; i++) {
      const raw = form.get(`file_${i}`);
      if (!(raw instanceof File) || raw.size === 0) break;

      if (raw.size > ID_FILE_MAX_BYTES) {
        throw new GuestIdError(`File ${i + 1} is larger than 10 MB.`);
      }

      const labelRaw = form.get(`label_${i}`);
      const label =
        labelRaw === 'front' || labelRaw === 'back' ? labelRaw : null;

      files.push({ file: raw, label });
    }

    if (files.length === 0) {
      throw new GuestIdError('Attach at least one ID photo.');
    }

    return files;
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
     * Records an ID: with one or more files (`soft_copy`, only while uploads
     * are enabled) or as seen in person at the villa (no file).
     * `uploadedFiles` comes from parseUploadedFiles() and must be non-empty
     * when stage === 'soft_copy'.
     */
    async recordId(
      input: z.output<typeof RecordIdSchema>,
      uploadedFiles: UploadedFile[] | null,
      actor: string,
    ) {
      const masked = maskIdNumber(input.docType, input.idNumber);
      if (!masked.ok) throw new GuestIdError(masked.message);

      interface ParsedFile {
        bytes: Uint8Array;
        contentType: NonNullable<ReturnType<typeof sniffIdFileType>>;
        label: string | null;
      }

      let parsedFiles: ParsedFile[] = [];

      if (input.stage === 'soft_copy') {
        if (!guestIdUploadsEnabled()) {
          throw new GuestIdError(
            'Storing ID files is not switched on yet. Record the ID as seen in person.',
          );
        }

        if (!uploadedFiles || uploadedFiles.length === 0) {
          throw new GuestIdError('Attach the ID photo.');
        }

        for (const { file, label } of uploadedFiles) {
          if (file.size > ID_FILE_MAX_BYTES) {
            throw new GuestIdError('A file is larger than 10 MB.');
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          const contentType = sniffIdFileType(bytes.subarray(0, 16));

          if (!contentType) {
            throw new GuestIdError('Use a JPEG, PNG or WebP photo, or a PDF.');
          }

          parsedFiles.push({ bytes, contentType, label });
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
      const purgeDate = idPurgeDate(booking.checkOut, property.retention_days);

      // Insert the document row first (files FK to it).
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
          captured_by: actor,
          purge_after: purgeDate,
        });

      if (insertError) {
        (await getLogger()).error(
          { bookingId: input.bookingId, code: insertError.code },
          'villa guest id record failed',
        );
        throw new GuestIdError('Could not save the ID. Please try again.');
      }

      // Upload each file and create a file row.
      const uploadedPaths: string[] = [];

      for (let i = 0; i < parsedFiles.length; i++) {
        const { bytes, contentType, label } = parsedFiles[i]!;
        const fileId = crypto.randomUUID();
        const path = `${input.accountId}/${input.propertyId}/${input.bookingId}/${documentId}/${fileId}`;

        const { error: uploadError } = await admin.storage
          .from(GUEST_DOCS_BUCKET)
          .upload(path, bytes, { contentType, upsert: false });

        if (uploadError) {
          (await getLogger()).error(
            {
              bookingId: input.bookingId,
              fileIndex: i,
              error: uploadError.message,
            },
            'villa guest id file upload failed',
          );
          // Roll back already-uploaded files and the document row.
          if (uploadedPaths.length) {
            await admin.storage.from(GUEST_DOCS_BUCKET).remove(uploadedPaths);
          }
          await admin
            .from('villa_guest_documents')
            .delete()
            .eq('id', documentId);
          throw new GuestIdError(
            'Could not save the ID photo. Please try again.',
          );
        }

        const { error: fileInsertError } = await admin
          .from('villa_guest_document_files')
          .insert({
            document_id: documentId,
            account_id: input.accountId,
            file_order: i + 1,
            label,
            storage_path: path,
            content_type: contentType,
            purge_after: purgeDate,
            captured_by: actor,
          });

        if (fileInsertError) {
          // Roll back this file from storage.
          await admin.storage.from(GUEST_DOCS_BUCKET).remove([path]);
          if (uploadedPaths.length) {
            await admin.storage.from(GUEST_DOCS_BUCKET).remove(uploadedPaths);
          }
          await admin
            .from('villa_guest_documents')
            .delete()
            .eq('id', documentId);
          (await getLogger()).error(
            { bookingId: input.bookingId, code: fileInsertError.code },
            'villa guest id file row failed',
          );
          throw new GuestIdError('Could not save the ID. Please try again.');
        }

        uploadedPaths.push(path);
      }

      await recordIdAccess([
        {
          accountId: input.accountId,
          documentId,
          action: parsedFiles.length > 0 ? 'uploaded' : 'recorded',
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

    /**
     * Marks a single document as checked (verified) by the current actor.
     * If this was the last unverified document on the booking and all adults
     * have an ID, the booking id_status is advanced to 'verified' automatically.
     */
    async markDocVerified(
      input: z.output<typeof MarkDocVerifiedSchema>,
      actor: string,
    ) {
      const admin = getSupabaseServerAdminClient();

      const now = new Date().toISOString();

      const { data: doc, error: docError } = await admin
        .from('villa_guest_documents')
        .update({ verified_by: actor, verified_at: now })
        .eq('id', input.documentId)
        .eq('account_id', input.accountId)
        .eq('property_id', input.propertyId)
        .eq('site_booking_id', input.bookingId)
        .is('verified_at', null)
        .is('purged_at', null)
        .select('id')
        .maybeSingle();

      if (docError) {
        throw new GuestIdError('Could not mark the ID as checked.');
      }

      if (!doc) {
        // Already verified or purged — not an error.
        return;
      }

      await recordIdAccess([
        {
          accountId: input.accountId,
          documentId: doc.id,
          action: 'verified',
          actor,
        },
      ]);

      // Check if all adult guests' docs are now verified; if so, auto-advance
      // the booking id_status to 'verified'.
      try {
        const { count: unverified } = await admin
          .from('villa_guest_documents')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', input.accountId)
          .eq('property_id', input.propertyId)
          .eq('site_booking_id', input.bookingId)
          .is('verified_at', null)
          .is('purged_at', null);

        if (unverified === 0) {
          const site = await getVillaSite(input.accountId, input.propertyId);
          const booking = await setIdStatus(
            site,
            input.bookingId,
            'verified',
            actor,
          );
          await mirrorBooking(site, booking);
        }
      } catch (e) {
        (await getLogger()).warn(
          { bookingId: input.bookingId, error: String(e) },
          'villa per-doc verify: auto id_status advance failed',
        );
      }
    },

    /** Owner only (checked by the caller): removes all files for a document. */
    async deleteId(input: z.output<typeof DeleteIdSchema>, actor: string) {
      const admin = getSupabaseServerAdminClient();

      const { data: doc, error } = await admin
        .from('villa_guest_documents')
        .select('id, stage, purged_at')
        .eq('id', input.documentId)
        .eq('account_id', input.accountId)
        .maybeSingle();

      if (error) throw new GuestIdError('Could not load the ID.');
      if (!doc || doc.purged_at)
        throw new GuestIdError('That ID is already deleted.');

      // Find all live files for this document.
      const { data: files, error: filesError } = await admin
        .from('villa_guest_document_files')
        .select('id, storage_path')
        .eq('document_id', doc.id)
        .is('purged_at', null);

      if (filesError) throw new GuestIdError('Could not load the ID files.');

      // Remove all storage objects.
      const paths = (files ?? [])
        .map((f) => f.storage_path)
        .filter(Boolean) as string[];

      if (paths.length) {
        const { error: removeError } = await admin.storage
          .from(GUEST_DOCS_BUCKET)
          .remove(paths);

        if (removeError)
          throw new GuestIdError('Could not delete the ID photos.');
      }

      // Tombstone each file row.
      const now = new Date().toISOString();

      if ((files ?? []).length > 0) {
        const { error: updateFilesError } = await admin
          .from('villa_guest_document_files')
          .update({ purged_at: now })
          .eq('document_id', doc.id)
          .is('purged_at', null);

        if (updateFilesError)
          throw new GuestIdError('Could not delete the ID.');
      }

      // Tombstone the document row.
      const { error: updateError } = await admin
        .from('villa_guest_documents')
        .update({ purged_at: now })
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
     * A 60-second signed link to a specific ID file.
     * `fileId` is `villa_guest_document_files.id`.
     */
    async fileUrl(
      accountId: string,
      fileId: string,
      actor: string,
      download: boolean,
    ): Promise<string> {
      // RLS check via member client: member must be able to read the document.
      const { data: file, error } = await client
        .from('villa_guest_document_files')
        .select(
          'id, document_id, account_id, storage_path, content_type, purged_at, villa_guest_documents(id, account_id)',
        )
        .eq('id', fileId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (error || !file || !file.storage_path || file.purged_at) {
        throw new VillaDbError('NOT_FOUND', `file ${fileId}`);
      }

      // Find the document ID for the access log.
      const docArr = Array.isArray(file.villa_guest_documents)
        ? file.villa_guest_documents
        : [file.villa_guest_documents];
      const documentId = docArr[0]?.id ?? file.document_id;

      const recorded = await recordIdAccess([
        {
          accountId,
          documentId,
          action: download ? 'downloaded' : 'viewed',
          actor,
        },
      ]);

      if (!recorded)
        throw new GuestIdError('Could not open the ID. Please try again.');

      const { data, error: signError } = await getSupabaseServerAdminClient()
        .storage.from(GUEST_DOCS_BUCKET)
        .createSignedUrl(
          file.storage_path,
          SIGNED_URL_SECONDS,
          download
            ? {
                download: `id-${fileId.slice(0, 8)}.${extFromMime(file.content_type)}`,
              }
            : undefined,
        );

      if (signError || !data?.signedUrl) {
        throw new GuestIdError('Could not open the ID.');
      }

      return data.signedUrl;
    },

    /**
     * Returns signed URLs for all live files of a booking, for zipping.
     * Each entry carries the file's metadata.
     */
    async allFileUrls(
      accountId: string,
      bookingId: string,
      actor: string,
    ): Promise<
      {
        fileId: string;
        documentId: string;
        path: string;
        label: string | null;
        fileOrder: number;
        docType: string;
        contentType: string | null;
        signedUrl: string;
      }[]
    > {
      // This booking's documents first, so the file query can be narrowed to
      // them. Selecting every file on the account and filtering in memory
      // pulls the whole table in for one booking's download.
      const { data: bookingDocs } = await client
        .from('villa_guest_documents')
        .select('id')
        .eq('account_id', accountId)
        .eq('site_booking_id', bookingId)
        .is('purged_at', null);

      const docIds = (bookingDocs ?? []).map((d) => d.id);

      if (docIds.length === 0) return [];

      const { data: files, error } = await client
        .from('villa_guest_document_files')
        .select(
          'id, document_id, storage_path, content_type, label, file_order, purged_at, villa_guest_documents(doc_type)',
        )
        .eq('account_id', accountId)
        .in('document_id', docIds)
        .is('purged_at', null);

      if (error) throw new GuestIdError('Could not load the ID files.');

      const relevant = (files ?? []).filter((f) => f.storage_path);

      if (relevant.length === 0) return [];

      // Sign all URLs.
      const admin = getSupabaseServerAdminClient();
      const paths = relevant.map((f) => f.storage_path!);

      const { data: signed, error: signError } = await admin.storage
        .from(GUEST_DOCS_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_SECONDS);

      if (signError || !signed) {
        throw new GuestIdError('Could not prepare the download.');
      }

      const urlMap = new Map(signed.map((s) => [s.path, s.signedUrl]));

      await recordIdAccess(
        relevant.map((f) => ({
          accountId,
          documentId: f.document_id,
          action: 'downloaded' as const,
          actor,
        })),
      );

      return relevant.map((f) => {
        const docArr = Array.isArray(f.villa_guest_documents)
          ? f.villa_guest_documents
          : [f.villa_guest_documents];
        return {
          fileId: f.id,
          documentId: f.document_id,
          path: f.storage_path!,
          label: f.label,
          fileOrder: f.file_order,
          docType:
            (docArr[0] as { doc_type?: string } | null)?.doc_type ?? 'id',
          contentType: f.content_type,
          signedUrl: urlMap.get(f.storage_path!) ?? '',
        };
      });
    },

    /**
     * @deprecated Use fileUrl() instead. Kept for backward compatibility:
     * old `[documentId]` links are redirected to the first live file.
     */
    async viewUrl(
      accountId: string,
      documentId: string,
      actor: string,
    ): Promise<string> {
      const { data: file, error } = await client
        .from('villa_guest_document_files')
        .select('id')
        .eq('account_id', accountId)
        .eq('document_id', documentId)
        .is('purged_at', null)
        .order('file_order')
        .limit(1)
        .maybeSingle();

      if (error || !file) {
        throw new VillaDbError('NOT_FOUND', `document ${documentId}`);
      }

      return this.fileUrl(accountId, file.id, actor, false);
    },

    parseUploadedFiles,
  };
}
