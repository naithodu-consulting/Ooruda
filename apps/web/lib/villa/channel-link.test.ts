import { describe, expect, it } from 'vitest';

import {
  type ChannelBlockRef,
  type LinkableBooking,
  isChannelLinked,
  linkChannelStays,
} from './channel-link';

const FEED = 'feed-airbnb';
const OTHER_FEED = 'feed-booking-com';
const TODAY = '2026-11-02';

function block(
  over: Partial<ChannelBlockRef> & Pick<ChannelBlockRef, 'id'>,
): ChannelBlockRef {
  return {
    feedId: FEED,
    externalUid: `uid-${over.id}`,
    startDate: '2026-12-10',
    endDate: '2026-12-13',
    ...over,
  };
}

function booking(
  over: Partial<LinkableBooking> & Pick<LinkableBooking, 'id'>,
): LinkableBooking {
  return {
    sourceFeedId: FEED,
    sourceExternalUid: 'uid-b1',
    checkIn: '2026-12-10',
    checkOut: '2026-12-13',
    status: 'confirmed',
    ...over,
  };
}

describe('isChannelLinked', () => {
  it('needs both halves of the key', () => {
    expect(
      isChannelLinked({ sourceFeedId: FEED, sourceExternalUid: 'u' }),
    ).toBe(true);
    expect(
      isChannelLinked({ sourceFeedId: FEED, sourceExternalUid: null }),
    ).toBe(false);
    expect(
      isChannelLinked({ sourceFeedId: null, sourceExternalUid: 'u' }),
    ).toBe(false);
  });
});

describe('linkChannelStays', () => {
  it('does nothing when no booking claims a channel event', () => {
    const result = linkChannelStays({
      blocks: [block({ id: 'b1' })],
      bookings: [
        booking({ id: 'direct', sourceFeedId: null, sourceExternalUid: null }),
      ],
      today: TODAY,
    });

    expect(result.enrichedBlockIds.size).toBe(0);
    expect(result.orphanedBookingIds.size).toBe(0);
    expect(result.relinks).toEqual([]);
  });

  it('pairs a booking with its block on the UID', () => {
    const result = linkChannelStays({
      blocks: [
        block({ id: 'b1' }),
        block({ id: 'b2', startDate: '2027-01-02', endDate: '2027-01-05' }),
      ],
      bookings: [booking({ id: 'k1', sourceExternalUid: 'uid-b1' })],
      today: TODAY,
    });

    expect([...result.enrichedBlockIds]).toEqual(['b1']);
    expect(result.blockIdByBooking.get('k1')).toBe('b1');
    expect(result.relinks).toEqual([]);
    expect(result.orphanedBookingIds.size).toBe(0);
  });

  it('re-links a re-keyed event by its nights, and reports the repair', () => {
    const result = linkChannelStays({
      // Same stay, new UID: what Airbnb does whenever an event changes.
      blocks: [block({ id: 'b9', externalUid: 'uid-fresh' })],
      bookings: [booking({ id: 'k1', sourceExternalUid: 'uid-stale' })],
      today: TODAY,
    });

    expect([...result.enrichedBlockIds]).toEqual(['b9']);
    expect(result.relinks).toEqual([
      { bookingId: 'k1', feedId: FEED, externalUid: 'uid-fresh' },
    ]);
    expect(result.orphanedBookingIds.size).toBe(0);
  });

  it('prefers the exact UID match over a date match', () => {
    const result = linkChannelStays({
      blocks: [
        // Same nights as the booking, but a different UID.
        block({ id: 'decoy', externalUid: 'uid-other' }),
        block({ id: 'right', externalUid: 'uid-mine' }),
      ],
      bookings: [booking({ id: 'k1', sourceExternalUid: 'uid-mine' })],
      today: TODAY,
    });

    expect(result.blockIdByBooking.get('k1')).toBe('right');
    expect(result.relinks).toEqual([]);
  });

  it('never re-links across feeds', () => {
    const result = linkChannelStays({
      blocks: [block({ id: 'b1', feedId: OTHER_FEED, externalUid: 'uid-x' })],
      bookings: [booking({ id: 'k1', sourceExternalUid: 'uid-stale' })],
      today: TODAY,
    });

    expect(result.enrichedBlockIds.size).toBe(0);
    expect([...result.orphanedBookingIds]).toEqual(['k1']);
  });

  it('never claims one block for two bookings', () => {
    const result = linkChannelStays({
      blocks: [block({ id: 'only', externalUid: 'uid-1' })],
      bookings: [
        booking({ id: 'k1', sourceExternalUid: 'uid-1' }),
        booking({ id: 'k2', sourceExternalUid: 'uid-2' }),
      ],
      today: TODAY,
    });

    expect(result.blockIdByBooking.get('k1')).toBe('only');
    expect(result.blockIdByBooking.has('k2')).toBe(false);
    expect([...result.orphanedBookingIds]).toEqual(['k2']);
  });

  it('calls a future stay the feed has dropped orphaned', () => {
    const result = linkChannelStays({
      blocks: [],
      bookings: [
        booking({ id: 'k1', checkIn: '2026-12-10', checkOut: '2026-12-13' }),
      ],
      today: TODAY,
    });

    expect([...result.orphanedBookingIds]).toEqual(['k1']);
  });

  it('does not call a finished stay orphaned', () => {
    // The importer drops past events on purpose, so their absence says
    // nothing about whether the guest cancelled.
    const result = linkChannelStays({
      blocks: [],
      bookings: [
        booking({
          id: 'k1',
          checkIn: '2026-10-01',
          checkOut: '2026-10-04',
          status: 'completed',
        }),
      ],
      today: TODAY,
    });

    expect(result.orphanedBookingIds.size).toBe(0);
  });

  it('ignores a cancelled booking: its block is a bare channel stay again', () => {
    const result = linkChannelStays({
      blocks: [block({ id: 'b1', externalUid: 'uid-1' })],
      bookings: [
        booking({ id: 'k1', sourceExternalUid: 'uid-1', status: 'cancelled' }),
      ],
      today: TODAY,
    });

    expect(result.enrichedBlockIds.size).toBe(0);
    expect(result.orphanedBookingIds.size).toBe(0);
  });

  it('leaves the block unmatched when the dates moved as well', () => {
    const result = linkChannelStays({
      blocks: [
        block({
          id: 'moved',
          externalUid: 'uid-fresh',
          startDate: '2026-12-11',
          endDate: '2026-12-14',
        }),
      ],
      bookings: [booking({ id: 'k1', sourceExternalUid: 'uid-stale' })],
      today: TODAY,
    });

    // Nothing to match on: the operator sees both and decides.
    expect(result.enrichedBlockIds.size).toBe(0);
    expect([...result.orphanedBookingIds]).toEqual(['k1']);
    expect(result.relinks).toEqual([]);
  });

  it('ignores manual blocks, which no feed owns', () => {
    const result = linkChannelStays({
      blocks: [block({ id: 'manual', feedId: null, externalUid: null })],
      bookings: [booking({ id: 'k1', sourceExternalUid: 'uid-1' })],
      today: TODAY,
    });

    expect(result.enrichedBlockIds.size).toBe(0);
    expect([...result.orphanedBookingIds]).toEqual(['k1']);
  });
});

describe('linkChannelStays: ambiguity', () => {
  it('refuses a date match when two blocks hold the same nights', () => {
    const result = linkChannelStays({
      blocks: [
        block({ id: 'b1', externalUid: 'uid-a' }),
        block({ id: 'b2', externalUid: 'uid-b' }),
      ],
      bookings: [booking({ id: 'k1', sourceExternalUid: 'uid-stale' })],
      today: TODAY,
    });

    // Picking one of two would move a guest onto the wrong stay.
    expect(result.enrichedBlockIds.size).toBe(0);
    expect(result.relinks).toEqual([]);
    expect([...result.orphanedBookingIds]).toEqual(['k1']);
  });

  it('refuses a date match when two bookings want the same nights', () => {
    const result = linkChannelStays({
      blocks: [block({ id: 'b1', externalUid: 'uid-fresh' })],
      bookings: [
        booking({ id: 'k1', sourceExternalUid: 'uid-stale-1' }),
        booking({ id: 'k2', sourceExternalUid: 'uid-stale-2' }),
      ],
      today: TODAY,
    });

    expect(result.enrichedBlockIds.size).toBe(0);
    expect(result.relinks).toEqual([]);
    expect([...result.orphanedBookingIds].sort()).toEqual(['k1', 'k2']);
  });
});
