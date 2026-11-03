import { daysBetweenYmd } from '~/lib/billing-dates';

import { monthRange } from './calendar';

/**
 * Villa dashboard numbers from the bookings mirror. Pure, so the rules are
 * tested once:
 *   - only stays that sell nights count: confirmed and checked out
 *     (not holds awaiting payment, cancellations or lapsed holds);
 *   - a stay is split by night, so one crossing into next month counts only
 *     its nights in this month, and its revenue pro rata;
 *   - revenue is before GST (base + extra guests); GST is not the villa's.
 */

export interface KpiStay {
  status: string;
  check_in: string;
  check_out: string;
  nights: number;
  base_amount: number;
  extra_guest_amount: number;
  /** Taken off before GST, so it comes off revenue too. */
  discount_amount: number;
}

export interface MonthKpis {
  nightsInMonth: number;
  bookedNights: number;
  /** 0–100, one decimal. */
  occupancyPct: number;
  /** Rupees before GST for this month's nights. */
  revenue: number;
  /** Average revenue per booked night (ADR), rupees. */
  averageNightly: number;
  /** Revenue per available night (RevPAR), rupees. */
  revenuePerNight: number;
  stays: number;
}

/** Statuses that sell nights (also the mirror query's filter). */
export const SELLING_STATUSES = ['confirmed', 'completed'] as const;

const SELLING = new Set<string>(SELLING_STATUSES);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthKpis(month: string, stays: KpiStay[]): MonthKpis {
  const { from, to } = monthRange(month);
  const nightsInMonth = daysBetweenYmd(from, to);

  let bookedNights = 0;
  let revenue = 0;
  let count = 0;

  for (const s of stays) {
    if (!SELLING.has(s.status) || s.nights <= 0) continue;

    const start = s.check_in > from ? s.check_in : from;
    const end = s.check_out < to ? s.check_out : to;
    const nights = start < end ? daysBetweenYmd(start, end) : 0;

    if (nights === 0) continue;

    count++;
    bookedNights += nights;
    revenue +=
      ((Number(s.base_amount) +
        Number(s.extra_guest_amount) -
        Number(s.discount_amount)) *
        nights) /
      s.nights;
  }

  revenue = round2(revenue);

  return {
    nightsInMonth,
    bookedNights,
    occupancyPct: Math.round((bookedNights / nightsInMonth) * 1000) / 10,
    revenue,
    averageNightly: bookedNights ? round2(revenue / bookedNights) : 0,
    revenuePerNight: round2(revenue / nightsInMonth),
    stays: count,
  };
}

export interface TodayBooking {
  id: string;
  status: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
}

/** Who arrives, who is checked in, who leaves and who is staying, for `today` (India). */
export function todayBoard<T extends TodayBooking>(
  bookings: T[],
  today: string,
  checkedInIds: Set<string> = new Set(),
) {
  const confirmed = bookings.filter((b) => b.status === 'confirmed');

  return {
    // Scheduled to arrive today, but not yet checked in
    arrivals: confirmed.filter(
      (b) => b.checkIn === today && !checkedInIds.has(b.id),
    ),
    // Currently checked in and in-house
    checkedIn: confirmed.filter(
      (b) =>
        checkedInIds.has(b.id) && b.checkIn <= today && today <= b.checkOut,
    ),
    // Still confirmed on check-out day = scheduled departures
    departures: confirmed.filter((b) => b.checkOut === today),
    inHouse: confirmed.filter((b) => b.checkIn <= today && today < b.checkOut),
  };
}
