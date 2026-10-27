import { createClient } from '@supabase/supabase-js';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { checkAvailability, getUnavailableNights } from './availability';
import {
  createBlock,
  deleteBlock,
  listBlocks,
  releaseFromBlock,
} from './blocks';
import {
  cancelBooking,
  createOfflineBooking,
  getBooking,
  getBookingByCode,
  listBookings,
} from './bookings';
import type { VillaSite } from './client';
import { addDays } from './dates';
import {
  createPricingRule,
  deletePricingRule,
  getBaseRates,
  updateBaseRates,
} from './rates';
import type { Database as VillaDatabase } from './villa-db.types';

/**
 * Runs the adapter against a REAL villa-booking database — the local stack
 * (supabase start in the villa-booking repo). Skipped unless configured:
 *
 *   VILLA_DB_TEST_URL=http://127.0.0.1:54331 \
 *   VILLA_DB_TEST_SERVICE_ROLE_KEY=<local service key> \
 *   VILLA_DB_TEST_PROPERTY_SLUG=villa-19 \
 *     npx vitest run lib/villa-db/villa-db.integration.test.ts
 *
 * Only ever point it at a LOCAL database: it creates and cancels bookings.
 * Dates are random nights in 2031, so repeated runs do not collide and real
 * test data (near-term dates) is never touched. Bookings are cancelled, never
 * deleted (contract §5.5); blocks and rate rules are removed.
 */

// The sync log writes to Ooruda's database; not under test here.
vi.mock('./sync-log', () => ({
  logSync: vi.fn(),
  withSyncLog: async (
    _site: unknown,
    _op: string,
    _actor: unknown,
    run: () => Promise<{ result: unknown }>,
  ) => (await run()).result,
}));

const URL_ = process.env.VILLA_DB_TEST_URL;
const KEY = process.env.VILLA_DB_TEST_SERVICE_ROLE_KEY;
const SLUG = process.env.VILLA_DB_TEST_PROPERTY_SLUG ?? 'villa-19';

const enabled =
  !!URL_ && !!KEY && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_);

const run = enabled ? describe : describe.skip;

run('villa-db adapter against a local villa-booking database', () => {
  let site: VillaSite;
  let otherVilla: VillaSite;

  // A random 6-night window in 2031, well clear of any seeded data.
  const start = addDays('2031-01-05', Math.floor(Math.random() * 300));
  const d = (n: number) => addDays(start, n);

  beforeAll(async () => {
    const client = createClient<VillaDatabase>(URL_!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client
      .from('properties')
      .select('id, booking_code_prefix, name')
      .eq('slug', SLUG)
      .single();

    if (error) throw error;

    site = {
      client,
      propertyId: 'ooruda-test-property',
      accountId: 'ooruda-test-account',
      sitePropertyId: data.id,
      bookingCodePrefix: data.booking_code_prefix,
      name: data.name,
    };

    // Same database, a property id that is not this villa's.
    otherVilla = {
      ...site,
      sitePropertyId: '00000000-0000-0000-0000-00000000dead',
    };
  });

  it('reads base rates in rupees', async () => {
    const rates = await getBaseRates(site);

    expect(rates.weekdayNightly).toBeGreaterThan(0);
    expect(Number.isInteger(rates.weekdayNightly * 100)).toBe(true);
    expect(rates.maxGuests).toBeGreaterThanOrEqual(rates.includedGuests);
  });

  it('saves base rates on the site and reads them back', async () => {
    const original = await getBaseRates(site);
    const restore = {
      weekdayNightly: original.weekdayNightly,
      weekendNightly: original.weekendNightly,
      extraGuestRate: original.extraGuestRate,
      extraGuestTier2Rate: original.extraGuestTier2Rate,
      extraGuestTier2From: original.extraGuestTier2From,
      includedGuests: original.includedGuests,
      maxGuests: original.maxGuests,
      idealGuests: original.idealOccupancy ?? original.includedGuests,
      checkInTime: (original.checkInTime ?? '14:00').slice(0, 5),
      checkOutTime: (original.checkOutTime ?? '11:00').slice(0, 5),
    };

    try {
      const saved = await updateBaseRates(
        site,
        {
          ...restore,
          weekdayNightly: '12345.50',
          extraGuestTier2Rate: null,
          extraGuestTier2From: null,
          checkInTime: '13:30',
        },
        null,
      );

      expect(saved.weekdayNightly).toBe(12345.5);
      expect(saved.extraGuestTier2From).toBeNull();
      expect(saved.checkInTime?.slice(0, 5)).toBe('13:30');
    } finally {
      const back = await updateBaseRates(site, restore, null);
      expect(back.weekdayNightly).toBe(original.weekdayNightly);
      expect(back.extraGuestTier2From).toBe(original.extraGuestTier2From);
    }
  });

  it('reports a free window as available', async () => {
    expect(await checkAvailability(site, d(0), d(6))).toBe('AVAILABLE');
    expect(await getUnavailableNights(site, d(0), d(6))).toEqual([]);
  });

  it('blocks nights, splits a block, and removes it', async () => {
    const block = await createBlock(
      site,
      {
        from: d(0),
        to: d(3),
        reason: 'maintenance',
        notes: 'integration test',
      },
      null,
    );

    expect(block.notes).toMatch(/\[ooruda:[0-9a-f-]{36}\]/);
    expect(await checkAvailability(site, d(1), d(2))).toBe('DATE_BLOCKED');

    // Blocking the same nights again is refused.
    await expect(
      createBlock(site, { from: d(1), to: d(2), reason: 'owner_hold' }, null),
    ).rejects.toMatchObject({ code: 'DATE_BLOCKED' });

    // Release the middle night: [0,1) and [2,3) stay blocked.
    const { remaining } = await releaseFromBlock(
      site,
      block.id,
      { from: d(1), to: d(2) },
      null,
    );

    expect(remaining.map((b) => [b.startDate, b.endDate]).sort()).toEqual([
      [d(0), d(1)],
      [d(2), d(3)],
    ]);
    expect(await getUnavailableNights(site, d(0), d(3))).toEqual([d(0), d(2)]);

    // A second release of the (now replaced) original block loses cleanly:
    // CONFLICT, and it leaves no stray pieces behind.
    await expect(
      releaseFromBlock(site, block.id, { from: d(0), to: d(1) }, null),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    for (const piece of remaining) {
      await deleteBlock(site, piece.id, null);
    }

    expect(await listBlocks(site, d(0), d(3))).toEqual([]);
    expect(await checkAvailability(site, d(0), d(3))).toBe('AVAILABLE');
  });

  it('refuses to release a block a channel feed owns', async () => {
    // Imported blocks are replaced wholesale by every sync (apply_ical_feed),
    // so releasing one here would be undone minutes later. Written straight to
    // the table because only the importer ever creates these.
    const { data: feed, error: feedError } = await site.client
      .from('ical_feeds')
      .insert({
        property_id: site.sitePropertyId,
        name: 'Integration test feed',
        url: 'https://example.com/test.ics',
      })
      .select('id')
      .single();

    if (feedError) throw feedError;

    const { data: imported, error: blockError } = await site.client
      .from('blocked_dates')
      .insert({
        property_id: site.sitePropertyId,
        start_date: d(0),
        end_date: d(2),
        reason: 'offline_booking',
        source: 'ical',
        feed_id: feed.id,
      })
      .select('id')
      .single();

    if (blockError) throw blockError;

    try {
      const listed = await listBlocks(site, d(0), d(2));

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ source: 'ical', feedId: feed.id });

      await expect(
        releaseFromBlock(site, imported.id, { from: d(0), to: d(1) }, null),
      ).rejects.toMatchObject({ code: 'CHANNEL_MANAGED' });

      await expect(deleteBlock(site, imported.id, null)).rejects.toMatchObject({
        code: 'CHANNEL_MANAGED',
      });

      // Still there, and still owned by the feed.
      expect(await listBlocks(site, d(0), d(2))).toHaveLength(1);
    } finally {
      // Deleting the feed cascades to its blocks.
      await site.client.from('ical_feeds').delete().eq('id', feed.id);
    }

    expect(await listBlocks(site, d(0), d(2))).toEqual([]);
  });

  it('honours the booking cutoff, and lets the override past it', async () => {
    const cutoff = d(1);

    const { error: cutoffError } = await site.client
      .from('properties')
      .update({ booking_cutoff_date: cutoff })
      .eq('id', site.sitePropertyId);

    if (cutoffError) throw cutoffError;

    try {
      // A check-in after the cutoff is closed on the site…
      expect(await checkAvailability(site, d(2), d(3))).toBe('DATE_BLOCKED');

      // …but the nights themselves are free, which is what the override asks.
      expect(
        await checkAvailability(site, d(2), d(3), { ignoreCutoff: true }),
      ).toBe('AVAILABLE');

      // On or before the cutoff, nothing changes.
      expect(await checkAvailability(site, d(1), d(2))).toBe('AVAILABLE');

      const booking = await createOfflineBooking(
        site,
        {
          guestName: 'Cutoff Override',
          guestEmail: 'cutoff@example.com',
          guestPhone: '+919000000001',
          adults: 2,
          checkIn: d(2),
          checkOut: d(3),
          baseAmount: '1000.00',
          extraGuestAmount: '0.00',
          taxAmount: '0.00',
          totalAmount: '1000.00',
          channel: 'phone',
          paymentStatus: 'unpaid',
          ignoreCutoff: true,
        },
        null,
      );

      try {
        expect(booking.status).toBe('confirmed');

        // The override skips the cutoff and nothing else: those nights are now
        // taken, so a second booking of them is still refused.
        await expect(
          createOfflineBooking(
            site,
            {
              guestName: 'Second',
              guestEmail: 'second@example.com',
              guestPhone: '+919000000002',
              adults: 2,
              checkIn: d(2),
              checkOut: d(3),
              baseAmount: '1000.00',
              extraGuestAmount: '0.00',
              taxAmount: '0.00',
              totalAmount: '1000.00',
              channel: 'phone',
              paymentStatus: 'unpaid',
              ignoreCutoff: true,
            },
            null,
          ),
        ).rejects.toMatchObject({ code: 'DATE_UNAVAILABLE' });

        // Without the override the site refuses it as before.
        await expect(
          createOfflineBooking(
            site,
            {
              guestName: 'No override',
              guestEmail: 'no@example.com',
              guestPhone: '+919000000003',
              adults: 2,
              checkIn: d(4),
              checkOut: d(5),
              baseAmount: '1000.00',
              extraGuestAmount: '0.00',
              taxAmount: '0.00',
              totalAmount: '1000.00',
              channel: 'phone',
              paymentStatus: 'unpaid',
            },
            null,
          ),
        ).rejects.toMatchObject({ code: 'DATE_BLOCKED' });
      } finally {
        await cancelBooking(site, booking.id, null);
      }
    } finally {
      await site.client
        .from('properties')
        .update({ booking_cutoff_date: null })
        .eq('id', site.sitePropertyId);
    }
  });

  it('records an offline booking, sees it block the dates, and cancels it', async () => {
    const booking = await createOfflineBooking(
      site,
      {
        guestName: 'Integration Test Guest',
        guestPhone: '+919999999999',
        adults: 2,
        checkIn: d(3),
        checkOut: d(5),
        baseAmount: '29000.00',
        extraGuestAmount: 0,
        taxAmount: '5220.00',
        totalAmount: '34220.00',
        channel: 'phone',
        // 'unpaid' so the local site's invoice series is not consumed.
        paymentStatus: 'unpaid',
      },
      null,
    );

    expect(booking.status).toBe('confirmed');
    expect(booking.channel).toBe('phone');
    // Stored the way the site's own checkout stores Indian mobiles.
    expect(booking.guestPhone).toBe('9999999999');
    expect(booking.bookingCode).toMatch(
      new RegExp(`^${site.bookingCodePrefix ?? 'HB'}-[0-9A-Z]{3}-[0-9A-Z]{3}$`),
    );
    expect(booking.totalAmountPaise).toBe(3_422_000);
    expect(booking.invoiceNumber).toBeNull();

    expect(await checkAvailability(site, d(3), d(5))).toBe('DATE_UNAVAILABLE');
    expect((await listBookings(site, d(0), d(6))).map((b) => b.id)).toContain(
      booking.id,
    );
    expect((await getBookingByCode(site, booking.bookingCode!))?.id).toBe(
      booking.id,
    );

    // A second booking on the same nights is refused by the site's lock.
    await expect(
      createOfflineBooking(
        site,
        {
          guestName: 'Clash',
          adults: 1,
          checkIn: d(4),
          checkOut: d(6),
          baseAmount: 1,
          extraGuestAmount: 0,
          taxAmount: 0,
          totalAmount: 1,
          channel: 'manual',
          paymentStatus: 'unpaid',
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'DATE_UNAVAILABLE' });

    // Another villa cannot see or cancel it by id.
    expect(await getBooking(otherVilla, booking.id)).toBeNull();
    await expect(
      cancelBooking(otherVilla, booking.id, null),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const cancelled = await cancelBooking(site, booking.id, null);

    expect(cancelled.status).toBe('cancelled');
    expect(await checkAvailability(site, d(3), d(5))).toBe('AVAILABLE');

    await expect(cancelBooking(site, booking.id, null)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('lets only one of two concurrent partial releases win', async () => {
    const block = await createBlock(
      site,
      { from: d(0), to: d(3), reason: 'owner_hold' },
      null,
    );

    const results = await Promise.allSettled([
      releaseFromBlock(site, block.id, { from: d(0), to: d(1) }, null),
      releaseFromBlock(site, block.id, { from: d(2), to: d(3) }, null),
    ]);

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
      code: expect.stringMatching(/CONFLICT|NOT_FOUND/),
    });

    // Exactly the winner's remaining nights stay blocked — no duplicates.
    const blocks = await listBlocks(site, d(0), d(3));
    const nights = await getUnavailableNights(site, d(0), d(3));
    expect(nights).toHaveLength(2);
    expect(new Set(blocks.map((b) => `${b.startDate}:${b.endDate}`)).size).toBe(
      blocks.length,
    );

    for (const b of blocks) {
      await deleteBlock(site, b.id, null);
    }
  });

  it('refuses inconsistent totals before touching the site', async () => {
    await expect(
      createOfflineBooking(
        site,
        {
          guestName: 'Bad Maths',
          adults: 1,
          checkIn: d(0),
          checkOut: d(1),
          baseAmount: 100,
          extraGuestAmount: 0,
          taxAmount: 18,
          totalAmount: 120,
          channel: 'manual',
          paymentStatus: 'unpaid',
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('adds a seasonal rate and refuses an overlapping one', async () => {
    const rule = await createPricingRule(
      site,
      {
        name: 'Integration test rate',
        startDate: d(0),
        endDate: d(2),
        nightlyRate: '16000.00',
      },
      null,
    );

    expect(rule.nightlyRate).toBe(16000);

    await expect(
      createPricingRule(
        site,
        { name: 'Overlapping', startDate: d(1), endDate: d(3), nightlyRate: 1 },
        null,
      ),
    ).rejects.toMatchObject({ code: 'OVERLAP' });

    // Adjacent (half-open) is fine.
    const next = await createPricingRule(
      site,
      { name: 'Adjacent', startDate: d(2), endDate: d(3), nightlyRate: 1 },
      null,
    );

    await deletePricingRule(site, rule.id, null);
    await deletePricingRule(site, next.id, null);

    await expect(deletePricingRule(site, rule.id, null)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
