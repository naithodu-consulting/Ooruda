/**
 * The cancellation tiers, and what they mean for one booking.
 *
 * A port of the booking site's `src/lib/cancellation.ts`. The site is the
 * publisher of this policy - its Cancellation & Refund page, its homepage card
 * and its own confirmation email all derive from the same list - and Ooruda
 * sends the confirmation for bookings staff enter by hand. Both emails have to
 * quote the same ladder, so the tiers are mirrored here rather than guessed at
 * from a percentage.
 *
 * KEEP IN STEP: a tier change on the booking site must be repeated here, or a
 * hand-entered booking will be promised a different refund from a website one.
 * There is no shared package between the two codebases to hold it.
 *
 * Last checked against villa-booking on 2026-10-29 (its 00106 migration,
 * "cancellation_airbnb_parity").
 */

import { addDays } from '~/lib/villa-db/dates';

export interface CancellationTier {
  /** Phrase completed by " check-in", e.g. "More than 14 days before". */
  when: string;
  /** Refund percentage as shown, e.g. "100%". */
  amount: string;
  /** Lower bound of the window, in whole days before check-in. */
  minDaysBefore: number;
  /** Refund as a fraction of the total paid. */
  fraction: number;
}

/** Ordered widest window first; `cancellationOutlook` relies on that order. */
export const CANCELLATION_TIERS: CancellationTier[] = [
  {
    when: 'More than 14 days before',
    amount: '100%',
    minDaysBefore: 15,
    fraction: 1,
  },
  {
    when: '7 to 14 days before',
    amount: '50%',
    minDaysBefore: 7,
    fraction: 0.5,
  },
  { when: 'Under 7 days before', amount: '0%', minDaysBefore: 0, fraction: 0 },
];

export interface CancellationDeadline {
  /** The tier's window as dated text, e.g. "Until Wed 21 Oct, 11:59 pm". */
  when: string;
  /** Refund in paise. Zero on the final row. */
  refundPaise: number;
  /** The tier's percentage, e.g. "100%". */
  amount: string;
}

/**
 *   full     every tier is still ahead of the guest, including the 100% one
 *   partial  the top tier's deadline had passed before they booked
 *   none     they booked inside the last window, so no refund was available
 */
export type RefundState = 'full' | 'partial' | 'none';

export interface CancellationOutlook {
  state: RefundState;
  /** Only the tiers still reachable. Empty when the state is 'none'. */
  rows: CancellationDeadline[];
  /** Last moment any refund is available, e.g. "Thu 1 Oct, 11:59 pm". */
  lastRefundableAt?: string;
}

/**
 * Deadlines land at the end of the tier's own last day rather than at the
 * check-in time: a policy written in whole days names a day, not an instant,
 * and an end-of-day deadline cannot be argued with at 4pm.
 */
const DEADLINE_TIME = '11:59 pm';
/** The instant after a deadline, for the window that takes over from it. */
const WINDOW_OPENS = '12:00 am';

/** 23:59:59 at the property on the given date. */
function endOfDayIst(ymd: string): Date {
  return new Date(`${ymd}T23:59:59+05:30`);
}

const istNoon = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

/** "Wed 21 Oct" */
export const dayMonth = (ymd: string) =>
  istNoon(ymd).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/** "21 Oct" */
export const shortDayMonth = (ymd: string) =>
  istNoon(ymd).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/**
 * The tiers as they actually apply to one booking.
 *
 * Filtered against `asOf`, the moment the booking was made: a stay booked
 * three days out must not be shown "100% refunded until <a date last month>",
 * which is true of the policy and materially misleading about their booking.
 */
export function cancellationOutlook(
  checkIn: string,
  totalPaise: number,
  /** When the booking was made, as an ISO timestamp. */
  asOf: string,
): CancellationOutlook {
  const booked = new Date(asOf);

  if (Number.isNaN(booked.getTime())) return { state: 'none', rows: [] };

  /** The tier's last full day: the day it counts back to. */
  const deadline = (days: number) => addDays(checkIn, -days);
  const reachable = (days: number) => endOfDayIst(deadline(days)) >= booked;

  const refundable = CANCELLATION_TIERS.filter((t) => t.fraction > 0);
  const live = refundable.filter((t) => reachable(t.minDaysBefore));

  if (live.length === 0) return { state: 'none', rows: [] };

  const last = live[live.length - 1]!;

  const rows: CancellationDeadline[] = live.map((tier, i) => {
    const prev = live[i - 1];

    const when =
      i === 0 || !prev
        ? `Until ${dayMonth(deadline(tier.minDaysBefore))}, ${DEADLINE_TIME}`
        : // Opens the morning after the previous tier closed, rather than
          // restating one instant as both an end and a beginning.
          `${shortDayMonth(addDays(deadline(prev.minDaysBefore), 1))} ${WINDOW_OPENS} to ${shortDayMonth(deadline(tier.minDaysBefore))} ${DEADLINE_TIME}`;

    return {
      when,
      refundPaise: Math.round(totalPaise * tier.fraction),
      amount: tier.amount,
    };
  });

  // The closing row is what happens after the last refundable deadline.
  const zero = CANCELLATION_TIERS[CANCELLATION_TIERS.length - 1]!;

  rows.push({
    when: `After ${dayMonth(deadline(last.minDaysBefore))}, ${DEADLINE_TIME}`,
    refundPaise: 0,
    amount: zero.amount,
  });

  return {
    state: live.length === refundable.length ? 'full' : 'partial',
    rows,
    lastRefundableAt: `${dayMonth(deadline(last.minDaysBefore))}, ${DEADLINE_TIME}`,
  };
}
