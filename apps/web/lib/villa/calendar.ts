import { addDays, isYmd } from '~/lib/villa-db/dates';

/**
 * The villa calendar as nights. A night is the date a guest sleeps over:
 * a stay [check_in, check_out) occupies check_in … check_out − 1, so the
 * check-out day is free for the next arrival. Pure: no I/O, easy to test.
 */

export interface CalendarBooking {
  id: string;
  bookingCode: string | null;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
}

export interface CalendarBlock {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export type NightItem =
  | {
      kind: 'booking';
      id: string;
      label: string;
      /** Awaiting payment on the website: dates are held, not sold. */
      held: boolean;
      /** First night of the stay (shows the name there). */
      starts: boolean;
      /** Last night of the stay. */
      ends: boolean;
    }
  | {
      kind: 'block';
      id: string;
      reason: string | null;
      starts: boolean;
      ends: boolean;
    };

export interface CalendarDay {
  date: string;
  /** Day of the month, 1–31. */
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  items: NightItem[];
}

const MONTH = /^(\d{4})-(\d{2})$/;

/** 'YYYY-MM' if valid, else the month containing `today`. */
export function parseMonth(value: string | undefined, today: string): string {
  if (value && MONTH.test(value) && isYmd(`${value}-01`)) return value;
  return today.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

/** [first day of the month, first day of the next month). */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}

/** Monday = 0 … Sunday = 6. */
function weekdayMon0(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The whole Monday-to-Sunday weeks shown for `month`, as [from, to). */
export function gridRange(month: string): { from: string; to: string } {
  const { from, to } = monthRange(month);
  const lastNight = addDays(to, -1);

  return {
    from: addDays(from, -weekdayMon0(from)),
    to: addDays(lastNight, 7 - weekdayMon0(lastNight)),
  };
}

/** Block notes without Ooruda's internal trace marker. */
export function blockNoteForDisplay(notes: string | null): string | null {
  const text = notes?.replace(/\s*\[ooruda:[0-9a-f-]+\]/gi, '').trim();
  return text || null;
}

/**
 * The weeks (Monday first) covering `month`, with every night's bookings and
 * blocks. Cancelled and expired bookings are not shown: they hold no nights.
 */
export function buildMonth(
  month: string,
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
  today: string,
): CalendarDay[][] {
  const { from, to } = monthRange(month);
  const { from: start, to: end } = gridRange(month);

  const live = bookings.filter((b) =>
    ['pending', 'confirmed', 'completed'].includes(b.status),
  );

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let date = start; date < end; date = addDays(date, 1)) {
    const items: NightItem[] = [];

    for (const b of live) {
      if (b.checkIn <= date && date < b.checkOut) {
        items.push({
          kind: 'booking',
          id: b.id,
          label: b.guestName,
          held: b.status === 'pending',
          starts: date === b.checkIn,
          ends: addDays(date, 1) === b.checkOut,
        });
      }
    }

    for (const k of blocks) {
      if (k.startDate <= date && date < k.endDate) {
        items.push({
          kind: 'block',
          id: k.id,
          reason: k.reason,
          starts: date === k.startDate,
          ends: addDays(date, 1) === k.endDate,
        });
      }
    }

    week.push({
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date >= from && date < to,
      isToday: date === today,
      isPast: date < today,
      items,
    });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  return weeks;
}

export type AgendaEntry =
  | {
      kind: 'booking';
      id: string;
      bookingCode: string | null;
      guestName: string;
      held: boolean;
      /** First and last night shown, clipped to the month. */
      from: string;
      lastNight: string;
      checkIn: string;
      checkOut: string;
    }
  | {
      kind: 'block';
      id: string;
      reason: string | null;
      from: string;
      lastNight: string;
      startDate: string;
      endDate: string;
    };

/** Everything occupying a night in `month`, in date order (the phone view). */
export function buildAgenda(
  month: string,
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
): AgendaEntry[] {
  const { from, to } = monthRange(month);
  const clipFrom = (d: string) => (d < from ? from : d);
  const clipLast = (endExclusive: string) =>
    addDays(endExclusive > to ? to : endExclusive, -1);

  const entries: AgendaEntry[] = [
    ...bookings
      .filter(
        (b) =>
          ['pending', 'confirmed', 'completed'].includes(b.status) &&
          b.checkIn < to &&
          b.checkOut > from,
      )
      .map(
        (b): AgendaEntry => ({
          kind: 'booking',
          id: b.id,
          bookingCode: b.bookingCode,
          guestName: b.guestName,
          held: b.status === 'pending',
          from: clipFrom(b.checkIn),
          lastNight: clipLast(b.checkOut),
          checkIn: b.checkIn,
          checkOut: b.checkOut,
        }),
      ),
    ...blocks
      .filter((k) => k.startDate < to && k.endDate > from)
      .map(
        (k): AgendaEntry => ({
          kind: 'block',
          id: k.id,
          reason: k.reason,
          from: clipFrom(k.startDate),
          lastNight: clipLast(k.endDate),
          startDate: k.startDate,
          endDate: k.endDate,
        }),
      ),
  ];

  return entries.sort((a, b) => a.from.localeCompare(b.from));
}

/** Nights in `month` that are booked, held or blocked, and the total. */
export function monthOccupancy(
  month: string,
  bookings: CalendarBooking[],
  blocks: CalendarBlock[],
): { booked: number; blocked: number; nights: number } {
  const { from, to } = monthRange(month);
  let booked = 0;
  let blocked = 0;
  let nights = 0;

  for (let date = from; date < to; date = addDays(date, 1)) {
    nights++;
    const isBooked = bookings.some(
      (b) =>
        ['pending', 'confirmed', 'completed'].includes(b.status) &&
        b.checkIn <= date &&
        date < b.checkOut,
    );

    if (isBooked) booked++;
    else if (blocks.some((k) => k.startDate <= date && date < k.endDate)) {
      blocked++;
    }
  }

  return { booked, blocked, nights };
}
