/**
 * Pairing a channel's imported block with the booking an operator wrote for
 * it (villa-booking 00108).
 *
 * An Airbnb stay reaches Ooruda as a row in `blocked_dates`: nights, and
 * nothing else. The operator knows the guest and the payout, so they record a
 * booking linked to that event by (feed_id, external_uid). From then on the
 * two describe one stay, and every screen has to show one thing:
 *
 *   - Bookings lists the booking, never the bare channel row as well;
 *   - the calendar draws the booking, not a booking stacked on a block;
 *   - the block stays the availability authority, because the feed owns it.
 *
 * Pure on purpose: every rule here is a judgement about what the operator is
 * shown, and all of them are tested.
 */

/** A channel-owned block, as `listBlocks` returns it. */
export interface ChannelBlockRef {
  id: string;
  feedId: string | null;
  externalUid: string | null;
  startDate: string;
  /** Exclusive: the morning after the last night held. */
  endDate: string;
}

/** A booking that claims to fulfil a channel event. */
export interface LinkableBooking {
  id: string;
  sourceFeedId: string | null;
  sourceExternalUid: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
}

/** Statuses in which a booking still holds its nights. */
const HOLDING = ['pending', 'confirmed', 'completed'];

export function isChannelLinked(booking: {
  sourceFeedId: string | null;
  sourceExternalUid: string | null;
}): boolean {
  return Boolean(booking.sourceFeedId && booking.sourceExternalUid);
}

export interface ChannelLinkResult {
  /** Blocks now represented by a booking: do not show them in their own right. */
  enrichedBlockIds: Set<string>;
  /** booking id → the block it fulfils. */
  blockIdByBooking: Map<string, string>;
  /**
   * Channel-linked bookings the feed no longer lists, while the stay has
   * nights still to come. Either the guest cancelled on the channel or the
   * channel re-keyed the event AND moved its dates, so nothing could be
   * matched. The nights stay held — a booking is a promise to a guest, and
   * dropping it on the strength of one feed read is the worse mistake — and
   * the screens say so, which is the whole point of surfacing this.
   */
  orphanedBookingIds: Set<string>;
  /**
   * Links to rewrite: a booking matched by its dates rather than its UID,
   * because the channel reissued the UID. Applied after a sync, so the next
   * read matches on the UID again.
   */
  relinks: { bookingId: string; feedId: string; externalUid: string }[];
}

/**
 * Pairs a property's channel blocks with its channel-linked bookings.
 *
 * Matching runs in two passes, because the stable key is not always stable:
 *
 *   1. (feed, UID) — what the booking was created with, and what survives a
 *      sync of an unchanged event.
 *   2. (feed, exact dates) — the repair for a re-keyed event. Airbnb reissues
 *      the UID whenever an event changes (villa-booking 00102), so a stay
 *      whose guest count or price was edited on Airbnb comes back under a new
 *      UID on the same nights. Only blocks and bookings left unmatched by
 *      pass 1 are considered, so this can never steal a pairing from an exact
 *      match, and a block already matched is never claimed twice.
 *
 * If the dates moved as well, there is nothing left to match on. That booking
 * is reported as orphaned and the new event shows as an un-enriched channel
 * row: the operator sees both and decides, which is the honest outcome.
 */
export function linkChannelStays(input: {
  blocks: ChannelBlockRef[];
  bookings: LinkableBooking[];
  /** India's today; a stay already finished is never called orphaned. */
  today: string;
}): ChannelLinkResult {
  const linked = input.bookings.filter(
    (b) => isChannelLinked(b) && HOLDING.includes(b.status),
  );

  const result: ChannelLinkResult = {
    enrichedBlockIds: new Set(),
    blockIdByBooking: new Map(),
    orphanedBookingIds: new Set(),
    relinks: [],
  };

  if (linked.length === 0) return result;

  const feedBlocks = input.blocks.filter((b) => b.feedId);
  const takenBlocks = new Set<string>();
  const pending: LinkableBooking[] = [];

  // Pass 1: the UID the booking was created with.
  for (const booking of linked) {
    const exact = feedBlocks.find(
      (block) =>
        !takenBlocks.has(block.id) &&
        block.feedId === booking.sourceFeedId &&
        block.externalUid === booking.sourceExternalUid,
    );

    if (exact) {
      takenBlocks.add(exact.id);
      result.enrichedBlockIds.add(exact.id);
      result.blockIdByBooking.set(booking.id, exact.id);
    } else {
      pending.push(booking);
    }
  }

  // Pass 2: same feed, same nights — a re-keyed event.
  //
  // Only when the answer is unambiguous: exactly one unclaimed block on those
  // nights AND exactly one booking wanting them. A guess here would move one
  // guest's name and payout onto another guest's stay, silently, which is far
  // worse than leaving both for a human to look at.
  for (const booking of pending) {
    const candidates = feedBlocks.filter(
      (block) =>
        !takenBlocks.has(block.id) &&
        block.feedId === booking.sourceFeedId &&
        block.startDate === booking.checkIn &&
        block.endDate === booking.checkOut,
    );

    const rivals = pending.filter(
      (other) =>
        other.id !== booking.id &&
        other.sourceFeedId === booking.sourceFeedId &&
        other.checkIn === booking.checkIn &&
        other.checkOut === booking.checkOut,
    );

    const byDates =
      candidates.length === 1 && rivals.length === 0
        ? candidates[0]
        : undefined;

    if (byDates) {
      takenBlocks.add(byDates.id);
      result.enrichedBlockIds.add(byDates.id);
      result.blockIdByBooking.set(booking.id, byDates.id);

      if (byDates.externalUid) {
        result.relinks.push({
          bookingId: booking.id,
          feedId: byDates.feedId!,
          externalUid: byDates.externalUid,
        });
      }

      continue;
    }

    // A stay that has already ended has no block to match: the importer
    // drops past events deliberately (`classifyEvents`), so silence there
    // means nothing at all.
    if (booking.checkOut > input.today) {
      result.orphanedBookingIds.add(booking.id);
    }
  }

  return result;
}
