import { todayInBillingZone } from '~/lib/billing-dates';

/**
 * Moving a confirmed booking to different nights (edit booking Phase 3).
 *
 * The write itself is one statement on the booking site — `move_booking_dates`
 * (villa-booking 00112) — because releasing the old nights and claiming the
 * new ones has to be atomic. Between a release and a re-book the villa is for
 * sale on the website and on Airbnb, and losing that race leaves the guest
 * with no booking at all.
 *
 * What lives here is the part that is Ooruda's to decide: whether a move may
 * be offered at all, and how the old and new spans are described in the
 * booking history. Pure, so both are tested without a database.
 */

export interface DateMoveRefusal {
  code:
    | 'NOT_EDITABLE'
    | 'CHANNEL_SOLD'
    | 'ALREADY_INVOICED'
    | 'CHECKED_IN'
    | 'INVALID_RANGE'
    | 'PAST_CUTOFF'
    | 'NO_CHANGE';
  message: string;
}

export interface DateMoveSubject {
  status: string;
  sourceFeedId: string | null;
  invoiceNumber: string | null;
  checkIn: string;
  checkOut: string;
  /** Set once the guest has arrived; their stay can no longer be moved. */
  checkedInAt: string | null;
}

/** Nights between two YMD dates, half-open: check-out is not a night. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);

  if (Number.isNaN(a) || Number.isNaN(b)) return 0;

  return Math.round((b - a) / 86_400_000);
}

/**
 * Whether this booking's dates may be moved, or why not.
 *
 * Every refusal here is also enforced by `move_booking_dates` on the booking
 * site, except the cutoff — see below. Checking twice is deliberate: this
 * gives the operator a sentence they can act on, and the site statement holds
 * the line against anything that changes between the two.
 *
 * THE CUTOFF IS OURS ALONE. The site's `properties.booking_cutoff_date` is
 * null for Villa 19; the date staff actually set lives in Ooruda's
 * `villa_account_settings.booking_cutoff_date`. So the site's own cutoff
 * check cannot fire, and this is the only thing enforcing it. Verified
 * against both databases on 2026-11-06.
 */
export function checkDateMove(args: {
  booking: DateMoveSubject;
  checkIn: string;
  checkOut: string;
  /** From villa_account_settings; null means no cutoff is set. */
  cutoff: string | null;
  /** Staff may knowingly move a stay past the cutoff, as they may create one. */
  ignoreCutoff?: boolean;
}): DateMoveRefusal | null {
  const { booking, checkIn, checkOut } = args;

  if (booking.status !== 'confirmed') {
    return {
      code: 'NOT_EDITABLE',
      message: `Only a confirmed booking can be moved. This one is ${booking.status}.`,
    };
  }

  if (booking.checkedInAt) {
    return {
      code: 'CHECKED_IN',
      message:
        'This guest has already checked in, so the stay cannot be moved. Record what actually happened instead.',
    };
  }

  if (booking.sourceFeedId !== null) {
    return {
      code: 'CHANNEL_SOLD',
      message:
        'This stay was sold by a booking channel, which owns its dates. Change them on the channel instead.',
    };
  }

  if (booking.invoiceNumber !== null) {
    return {
      code: 'ALREADY_INVOICED',
      message: `This stay has been invoiced (${booking.invoiceNumber}). Its dates are stated on a tax document, so changing them needs a credit or debit note.`,
    };
  }

  if (nightsBetween(checkIn, checkOut) < 1) {
    return {
      code: 'INVALID_RANGE',
      message: 'Check-out must be after check-in.',
    };
  }

  if (checkIn === booking.checkIn && checkOut === booking.checkOut) {
    return {
      code: 'NO_CHANGE',
      message: 'These are already the booking’s dates.',
    };
  }

  // Date-only string comparison: `new Date('YYYY-MM-DD')` is UTC midnight and
  // shifts a day in IST.
  if (!args.ignoreCutoff && args.cutoff && checkIn > args.cutoff) {
    return {
      code: 'PAST_CUTOFF',
      message: `Bookings are closed after ${args.cutoff}. Change the cutoff in Villa Settings, or pick earlier dates.`,
    };
  }

  // A stay cannot be moved into the past: it would be "completed" the moment
  // it was saved, and no guest can arrive on a day that has gone.
  if (checkIn < todayInBillingZone()) {
    return {
      code: 'INVALID_RANGE',
      message: 'A booking cannot be moved to a date in the past.',
    };
  }

  return null;
}

/** The booking-history line for a move. */
export function describeDateMove(
  before: { checkIn: string; checkOut: string },
  after: { checkIn: string; checkOut: string },
): string {
  const nightsBefore = nightsBetween(before.checkIn, before.checkOut);
  const nightsAfter = nightsBetween(after.checkIn, after.checkOut);
  const nightWord = (n: number) => `${n} night${n === 1 ? '' : 's'}`;

  return (
    `Dates: ${before.checkIn} to ${before.checkOut} (${nightWord(nightsBefore)})` +
    ` → ${after.checkIn} to ${after.checkOut} (${nightWord(nightsAfter)})`
  );
}
