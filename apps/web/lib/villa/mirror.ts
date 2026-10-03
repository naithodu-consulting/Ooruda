import 'server-only';
import { after } from 'next/server';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import type { Database } from '~/lib/database.types';
import {
  SYNC_PAGE_SIZE,
  type SiteBooking,
  listBookingsForSync,
} from '~/lib/villa-db/bookings';
import { type VillaSite, getVillaSite } from '~/lib/villa-db/client';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { isVillaDbError } from '~/lib/villa-db/errors';

import { fromPaise } from './money';

/**
 * villa_bookings_mirror: Ooruda's read-only copy of a villa's bookings, for
 * dashboards and reports (OORUDA_VILLA_PLAN.md §3.3). The booking site stays
 * the source of truth; everything here can be rebuilt by a full sync.
 *
 * Written only with the service role, after the caller has authorised (or,
 * for the scheduled sync, by the system itself).
 */

/** A mirror older than this is refreshed in the background on the dashboard. */
export const MIRROR_STALE_MS = 5 * 60_000;

/**
 * Later syncs re-read stays ending within this many days back, plus all
 * future ones: that is where cancellations, check-outs and payment changes
 * happen. The first sync copies everything.
 */
export const SYNC_WINDOW_DAYS = 120;

// 200 pages x 500 = 100,000 bookings: far beyond one villa; a runaway guard.
const MAX_PAGES = 200;

type MirrorInsert =
  Database['public']['Tables']['villa_bookings_mirror']['Insert'];

function toRow(site: VillaSite, b: SiteBooking): MirrorInsert {
  return {
    property_id: site.propertyId,
    site_booking_id: b.id,
    account_id: site.accountId,
    site_property_id: site.sitePropertyId,
    booking_code: b.bookingCode,
    reference_number: b.referenceNumber,
    channel: b.channel,
    status: b.status,
    payment_status: b.paymentStatus,
    check_in: b.checkIn,
    check_out: b.checkOut,
    nights: b.nights,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
    base_amount: fromPaise(b.baseAmountPaise),
    extra_guest_amount: fromPaise(b.extraGuestAmountPaise),
    tax_amount: fromPaise(b.taxAmountPaise),
    total_amount: fromPaise(b.totalAmountPaise),
    discount_amount: fromPaise(b.discountAmountPaise),
    id_status: b.idStatus,
    invoice_number: b.invoiceNumber,
    guest_name: b.guestName,
    guest_phone: b.guestPhone || null,
    guest_email: b.guestEmail || null,
    site_updated_at: b.updatedAt,
    synced_at: new Date().toISOString(),
    // booking_kind deliberately left out: an update keeps what Ooruda set.
  };
}

async function upsert(rows: MirrorInsert[]) {
  if (rows.length === 0) return;

  const { error } = await getSupabaseServerAdminClient()
    .from('villa_bookings_mirror')
    .upsert(rows, { onConflict: 'property_id,site_booking_id' });

  if (error) throw new Error(`mirror upsert failed: ${error.message}`);
}

/**
 * Write-through after Ooruda changes a booking on the site, so dashboards
 * see it at once. Best-effort: the site change already happened, and the
 * next sync repairs anything missed.
 */
export async function mirrorBooking(
  site: VillaSite,
  booking: SiteBooking,
  kind?: 'stay' | 'event',
): Promise<void> {
  try {
    await upsert([
      { ...toRow(site, booking), ...(kind ? { booking_kind: kind } : {}) },
    ]);
  } catch (error) {
    (await getLogger()).warn(
      { bookingId: booking.id, error: String(error) },
      'villa mirror write-through failed',
    );
  }
}

export interface MirrorSyncResult {
  propertyId: string;
  rows: number;
  full: boolean;
  /** When this run finished, for callers that display a "synced at" time. */
  syncedAt?: string;
  /** Another sync of this property was already running; nothing was done. */
  skipped?: boolean;
}

/** A sync older than this is presumed dead, and its lease can be taken. */
const LEASE_MS = 3 * 60_000;

/**
 * Takes the property's sync lease, so a dashboard refresh and the scheduled
 * run never copy the same villa at once. Returns false if another recent
 * sync holds it.
 */
async function takeLease(accountId: string, propertyId: string) {
  const admin = getSupabaseServerAdminClient();

  const { error: ensureError } = await admin
    .from('villa_mirror_sync_state')
    .upsert(
      { property_id: propertyId, account_id: accountId },
      { onConflict: 'property_id', ignoreDuplicates: true },
    );

  if (ensureError) {
    throw new Error(`mirror state create failed: ${ensureError.message}`);
  }

  const now = new Date();
  const expired = new Date(now.getTime() - LEASE_MS).toISOString();

  const { data, error } = await admin
    .from('villa_mirror_sync_state')
    .update({ sync_started_at: now.toISOString() })
    .eq('property_id', propertyId)
    .or(`sync_started_at.is.null,sync_started_at.lt.${expired}`)
    .select('last_full_at, full_site_property_id');

  if (error) throw new Error(`mirror lease failed: ${error.message}`);

  return data?.[0] ?? null;
}

async function logged(
  what: string,
  propertyId: string,
  run: PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await run;

  if (error) {
    (await getLogger()).error(
      { propertyId, error: error.message },
      `villa mirror ${what} failed`,
    );
  }
}

/**
 * Refreshes one property's mirror from its booking site. The first run, a
 * villa re-linked to another site property, or `full` copies every booking;
 * later runs re-read a recent window.
 */
export async function syncPropertyMirror(
  accountId: string,
  propertyId: string,
  options: { full?: boolean } = {},
): Promise<MirrorSyncResult> {
  const admin = getSupabaseServerAdminClient();
  const lease = await takeLease(accountId, propertyId);

  if (!lease) return { propertyId, rows: 0, full: false, skipped: true };

  const startedAt = new Date().toISOString();

  try {
    const site = await getVillaSite(accountId, propertyId);
    const full =
      Boolean(options.full) ||
      !lease.last_full_at ||
      lease.full_site_property_id !== site.sitePropertyId;
    const checkOutFrom = full
      ? undefined
      : addDays(todayIst(), -SYNC_WINDOW_DAYS);

    let rows = 0;
    let afterId: string | undefined;
    let complete = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const bookings = await listBookingsForSync(site, {
        checkOutFrom,
        afterId,
      });

      await upsert(bookings.map((b) => toRow(site, b)));
      rows += bookings.length;

      if (bookings.length < SYNC_PAGE_SIZE) {
        complete = true;
        break;
      }

      afterId = bookings.at(-1)!.id;
    }

    // Never record a partial copy as a finished one.
    if (!complete) throw new Error(`mirror sync exceeded ${MAX_PAGES} pages`);

    // A villa re-linked to a different site property must not keep the old
    // site's bookings. Normally deletes nothing.
    const { error: purgeError } = await admin
      .from('villa_bookings_mirror')
      .delete()
      .eq('property_id', propertyId)
      .neq('site_property_id', site.sitePropertyId);

    if (purgeError) {
      throw new Error(`mirror purge failed: ${purgeError.message}`);
    }

    // Event bookings: the site has no such field, so Ooruda's own activity
    // trail is the durable record (a failed write-through is repaired here).
    const { data: events, error: eventsError } = await admin
      .from('villa_booking_activity')
      .select('site_booking_id')
      .eq('property_id', propertyId)
      .eq('action', 'created')
      .eq('note', 'Event booking');

    if (eventsError) {
      throw new Error(`mirror events read failed: ${eventsError.message}`);
    }

    if (events && events.length > 0) {
      const { error: kindError } = await admin
        .from('villa_bookings_mirror')
        .update({ booking_kind: 'event' })
        .eq('property_id', propertyId)
        .eq('booking_kind', 'stay')
        .in(
          'site_booking_id',
          events.map((e) => e.site_booking_id),
        );

      if (kindError) {
        throw new Error(`mirror events update failed: ${kindError.message}`);
      }
    }

    const { error: saveError } = await admin
      .from('villa_mirror_sync_state')
      .update({
        last_synced_at: startedAt,
        ...(full
          ? {
              last_full_at: startedAt,
              full_site_property_id: site.sitePropertyId,
            }
          : {}),
        last_error: null,
        last_error_at: null,
        rows_synced: rows,
        sync_started_at: null,
      })
      .eq('property_id', propertyId);

    if (saveError) {
      throw new Error(`mirror state save failed: ${saveError.message}`);
    }

    return { propertyId, rows, full, syncedAt: startedAt };
  } catch (error) {
    const message = isVillaDbError(error)
      ? `${error.code}: ${error.detail ?? error.message}`
      : error instanceof Error
        ? error.message
        : String(error);

    await logged(
      'error record',
      propertyId,
      admin
        .from('villa_mirror_sync_state')
        .update({
          last_error: message.slice(0, 1000),
          last_error_at: new Date().toISOString(),
          sync_started_at: null,
        })
        .eq('property_id', propertyId),
    );

    (await getLogger()).error(
      { propertyId, error: message },
      'villa mirror sync failed',
    );

    throw error;
  }
}

/** The scheduled run stops starting new villas after this long. */
const SYNC_ALL_BUDGET_MS = 240_000;

/**
 * Refreshes every active, connected villa property (the scheduled sync),
 * longest-unsynced first, within a time budget so a slow run never starves
 * the same villas. One failing villa never stops the others.
 */
export async function syncAllMirrors(): Promise<{
  synced: MirrorSyncResult[];
  failed: { propertyId: string; error: string }[];
}> {
  const admin = getSupabaseServerAdminClient();
  const started = Date.now();

  const [{ data: properties, error }, { data: states, error: statesError }] =
    await Promise.all([
      admin
        .from('villa_properties')
        .select('id, account_id')
        .eq('status', 'active')
        .not('site_property_id', 'is', null),
      admin
        .from('villa_mirror_sync_state')
        .select('property_id, last_synced_at'),
    ]);

  if (error || statesError) {
    throw new Error(
      `villa properties load failed: ${(error ?? statesError)!.message}`,
    );
  }

  const lastSynced = new Map(
    (states ?? []).map((s) => [s.property_id, s.last_synced_at ?? '']),
  );
  const ordered = [...(properties ?? [])].sort((a, b) =>
    (lastSynced.get(a.id) ?? '').localeCompare(lastSynced.get(b.id) ?? ''),
  );

  const synced: MirrorSyncResult[] = [];
  const failed: { propertyId: string; error: string }[] = [];

  for (const p of ordered) {
    if (Date.now() - started > SYNC_ALL_BUDGET_MS) break;

    try {
      synced.push(await syncPropertyMirror(p.account_id, p.id));
    } catch (e) {
      failed.push({
        propertyId: p.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { synced, failed };
}

/** How long a page will wait for a routine refresh before rendering anyway. */
const INLINE_SYNC_BUDGET_MS = 2_500;

/** The sync-state columns `refreshMirrorForRead` needs to make its decision. */
export interface MirrorReadState {
  /** When the figures the caller is about to read were last refreshed. */
  syncedAt: string | null;
  /** The last refresh failed; the caller is reading the last good figures. */
  failing: boolean;
}

/**
 * Brings the mirror up to date *before* the caller reads it, so a page shows
 * current figures on the first load rather than the load after.
 *
 * Waiting is bounded three ways, so this never costs a page its speed:
 *   - a mirror synced within MIRROR_STALE_MS is left alone;
 *   - the first copy of a villa walks its whole history, so that one runs
 *     behind the response and the page renders what it already has. A villa
 *     re-linked to another site property copies everything again too, which
 *     `syncPropertyMirror` decides for itself; that one is rare and does wait.
 *   - a routine refresh reads a bounded recent window, which is quick, but a
 *     slow booking site still only delays the page by INLINE_SYNC_BUDGET_MS —
 *     past that the sync finishes on its own.
 *
 * The caller must have authorised the property first (see villa-db/client).
 */
export async function refreshMirrorForRead(
  accountId: string,
  propertyId: string,
): Promise<MirrorReadState> {
  const { data: state, error } = await getSupabaseServerAdminClient()
    .from('villa_mirror_sync_state')
    .select('last_synced_at, last_full_at, last_error_at')
    .eq('property_id', propertyId)
    .maybeSingle();

  if (error) {
    // Reading the state is not worth failing a page over, but a silent miss
    // here would quietly disable the refresh below, so it is logged.
    (await getLogger()).warn(
      { propertyId, error: error.message },
      'villa mirror state read failed',
    );
    return { syncedAt: null, failing: false };
  }

  const now = Date.now();
  const syncedAt = state?.last_synced_at ?? null;
  const lastSync = syncedAt ? Date.parse(syncedAt) : 0;
  const lastError = state?.last_error_at ? Date.parse(state.last_error_at) : 0;
  const failing = lastError > lastSync;

  if (now - lastSync <= MIRROR_STALE_MS) return { syncedAt, failing };

  // A site that just failed is not retried on every load.
  if (failing && now - lastError < MIRROR_STALE_MS) {
    return { syncedAt, failing };
  }

  const run = syncPropertyMirror(accountId, propertyId).catch(async (err) => {
    // syncPropertyMirror stamps last_error_at itself, which drives the
    // back-off above; this line is so the failure is also visible in the log.
    (await getLogger()).warn(
      { propertyId, error: String(err) },
      'villa mirror read-refresh failed',
    );
    return undefined;
  });

  // Hand the promise to the runtime so it still finishes if we stop waiting.
  after(() => run);

  if (!state?.last_full_at) return { syncedAt, failing };

  let timer: ReturnType<typeof setTimeout> | undefined;

  const done = await Promise.race([
    run,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), INLINE_SYNC_BUDGET_MS);
    }),
  ]).finally(() => {
    // Without this the timer holds the invocation open after the response.
    if (timer) clearTimeout(timer);
  });

  return { syncedAt: done?.syncedAt ?? syncedAt, failing: !done && failing };
}
