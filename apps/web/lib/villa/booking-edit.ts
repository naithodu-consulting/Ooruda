/**
 * What an edit to a booking's guest details is allowed to change, and how the
 * change is described in the activity log.
 *
 * Pure on purpose: the rules below are the interesting part of editing a
 * booking and they are decided without touching either database, so they are
 * unit-tested directly (`booking-edit.test.ts`) rather than through the site.
 *
 * SCOPE (Phase 1, OORUDA_VILLA_TODO "Editing existing bookings"): who the
 * guest is, how to reach them, how many of them there are, and what they
 * asked for. Never money and never dates - those are Phases 2 and 3, and a
 * date change additionally needs an atomic availability check.
 */

import { MAX_ACTIVITY_NOTE } from './constants';
import {
  billableGuests,
  extraGuestCount,
  maxOccupancyMessage,
} from './pricing';

/** Infants are free and uncapped: they count in neither rule below. */
export interface GuestCounts {
  adults: number;
  children: number;
  infants: number;
}

export interface OccupancyRules {
  /** `properties.base_occupancy`: guests included in the nightly rate. */
  baseOccupancy: number;
  /** `properties.max_occupancy`: the most the villa sleeps. */
  maxOccupancy: number;
}

export interface GuestChangeRefusal {
  code: 'MAX_OCCUPANCY' | 'PRICE_WOULD_CHANGE' | 'PRICE_BASIS_UNKNOWN';
  message: string;
}

/**
 * Whether the new guest counts may be saved, or why not.
 *
 * Three refusals, all deliberate:
 *
 * MAX_OCCUPANCY - the villa cannot sleep them. The same ceiling, and the same
 * wording, the booking form applies, so an edit cannot put a booking into a
 * state a new booking could not have been created in. Applies to channel
 * stays too: the channel owns the money, not the fire regulations.
 *
 * PRICE_WOULD_CHANGE - the count crosses `base_occupancy`, so the extra-guest
 * charge the stay was priced on is no longer the right one. Saving the count
 * alone would leave the booking recording (say) ten guests at an eight-guest
 * price, and Reports, the invoice and the balance due would all understate it.
 * Phase 1 does not touch money, so it declines rather than record a figure it
 * knows to be wrong.
 *
 * PRICE_BASIS_UNKNOWN - the stay's recorded extra-guest amount does not agree
 * with what the rate card would charge for the guests it already records, so
 * the formula is NOT this booking's basis and reasoning from it would be
 * guesswork. That happens when `base_occupancy` was changed after the booking
 * was taken. Refusing with an accurate reason beats either a confident lie or
 * letting a real divergence through: a stay sold at 5 guests with one extra
 * charged, under a `base_occupancy` since raised to 6, computes 0 extras both
 * before and after an edit to 6 guests - so a naive formula check would wave
 * through exactly the mismatch this guard exists to catch.
 *
 * A flat-priced stay is the one case where a crossing change is still allowed:
 * a preferential price records `extra_guest_amount = 0` whatever the headcount
 * (`isSpecialPrice` in the booking service), so the amount provably does not
 * depend on how many are staying and correcting the count changes nothing
 * about what is owed.
 *
 * A stay a channel sold is exempt from every price rule: the channel is the
 * merchant of record and has already charged the guest, so the counts are ours
 * to correct while the money is not ours to restate.
 */
export function checkGuestChange(args: {
  before: GuestCounts;
  after: GuestCounts;
  rules: OccupancyRules;
  /** True when the booking fulfils a channel feed's event. */
  isChannelSold: boolean;
  /**
   * The extra-guest amount the booking actually records, in paise
   * (`bookings.extra_guest_amount`). The booking's own basis, as against what
   * the current rate card would say.
   */
  recordedExtraGuestPaise: number;
}): GuestChangeRefusal | null {
  const { before, after, rules, isChannelSold, recordedExtraGuestPaise } = args;
  const guests = billableGuests(after);

  if (guests > rules.maxOccupancy) {
    return {
      code: 'MAX_OCCUPANCY',
      message: `${maxOccupancyMessage(rules.maxOccupancy)} That would be ${guests}.`,
    };
  }

  if (isChannelSold) return null;

  // Nothing chargeable moved - a different split of the same party, or only
  // infants - so no pricing question arises at all. Checked before the basis,
  // which would otherwise block an infants-only correction on a stay whose
  // price we cannot reason about.
  if (billableGuests(before) === billableGuests(after)) return null;

  const wasExtra = extraGuestCount(before, rules.baseOccupancy);
  const nowExtra = extraGuestCount(after, rules.baseOccupancy);

  // Does the rate card actually describe this booking? Compared BEFORE the
  // no-change shortcut: `base_occupancy` raised from 4 to 6 after a 5-guest
  // stay was sold with one extra charged makes the formula say 0 extras both
  // before and after an edit to 6 guests, so shortcutting on
  // `wasExtra === nowExtra` would wave through the very mismatch this guard
  // exists to catch.
  const formulaFitsRecord = wasExtra > 0 === recordedExtraGuestPaise > 0;

  if (!formulaFitsRecord) {
    // Flat-priced: the recorded amount is zero where the rate card would have
    // charged, so the total provably does not follow the headcount and the
    // count is free to correct.
    if (recordedExtraGuestPaise === 0) return null;

    // Charged for extras the rate card says it has none of: the basis moved
    // under the booking and the formula no longer describes it.
    return {
      code: 'PRICE_BASIS_UNKNOWN',
      message:
        'This stay was priced outside the current rate card, so the guest count cannot be ' +
        'changed here without restating what is owed. Record the money adjustment first, ' +
        'or leave the count as it is.',
    };
  }

  if (wasExtra === nowExtra) return null;

  const direction = nowExtra > wasExtra ? 'more' : 'fewer';

  return {
    code: 'PRICE_WOULD_CHANGE',
    message:
      `This booking is priced for ${wasExtra} guest${wasExtra === 1 ? '' : 's'} above the ` +
      `included ${rules.baseOccupancy}, and ${guests} guests would be ${nowExtra}. ` +
      `Changing the count alone would charge for ${direction} guests than are staying. ` +
      `Record the money adjustment first, or leave the count as it is.`,
  };
}

/** The fields this edit covers, as they are held on the booking site. */
export interface BookingGuestDetails {
  salutation: string;
  /**
   * The site's own joined `guest_name` column - NOT NULL there, while the
   * name parts are nullable. It is what the GST invoice, the registration
   * card, the police verification and the site's confirmation email all read,
   * so it is diffed in its own right: a row whose parts were empty could
   * otherwise have its full name rewritten with nothing in the log but
   * "First name: (empty) → Ramesh".
   */
  guestName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  adults: number;
  children: number;
  infants: number;
  specialRequests: string;
}

/**
 * First and last name to edit, for a booking that may only have the joined
 * `guest_name`.
 *
 * The site's checkout, its own admin and any import can write `guest_name`
 * (NOT NULL) while leaving `guest_first_name` / `guest_last_name` null. The
 * edit form requires a first name, so seeding it from the empty parts meant
 * the operator never saw the stored name and typing one word rewrote
 * "Ramesh Kumar Nair" to "Ramesh".
 *
 * Split on the FIRST space so the join is lossless: "Ramesh Kumar Nair"
 * becomes "Ramesh" + "Kumar Nair", which rejoins to exactly what was there.
 */
export function splitGuestName(
  guestName: string,
  parts: { firstName: string | null; lastName: string | null },
): { firstName: string; lastName: string } {
  const first = parts.firstName?.trim() ?? '';
  const last = parts.lastName?.trim() ?? '';

  // The parts are authoritative whenever either is populated.
  if (first || last) return { firstName: first, lastName: last };

  const whole = guestName.trim().replace(/\s+/g, ' ');

  if (whole === '') return { firstName: '', lastName: '' };

  const cut = whole.indexOf(' ');

  return cut === -1
    ? { firstName: whole, lastName: '' }
    : { firstName: whole.slice(0, cut), lastName: whole.slice(cut + 1) };
}

const LABELS: { key: keyof BookingGuestDetails; label: string }[] = [
  { key: 'salutation', label: 'Salutation' },
  { key: 'guestName', label: 'Name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'adults', label: 'Adults' },
  { key: 'children', label: 'Children' },
  { key: 'infants', label: 'Infants' },
];

/**
 * Field-level diff, for the activity log. Every changed field is named with
 * both values, which is the point of the entry: "who changed what to what"
 * is the question asked of it months later, over a GST invoice or a police
 * verification.
 *
 * Special requests are summarised rather than quoted: the field holds up to
 * 1000 characters on its own and the note column holds 1000 in total, so
 * quoting both versions would crowd out every other field.
 */
export function describeBookingChanges(
  before: BookingGuestDetails,
  after: BookingGuestDetails,
): string[] {
  const changes: string[] = [];

  for (const { key, label } of LABELS) {
    const was = before[key];
    const now = after[key];

    if (String(was) === String(now)) continue;

    changes.push(`${label}: ${blank(was)} → ${blank(now)}`);
  }

  const wasText = before.specialRequests.trim();
  const nowText = after.specialRequests.trim();

  if (wasText !== nowText) {
    changes.push(
      `Special requests: ${
        wasText === '' ? 'added' : nowText === '' ? 'cleared' : 'changed'
      }`,
    );
  }

  return changes;
}

function blank(value: string | number): string {
  const text = String(value).trim();
  return text === '' ? '(empty)' : text;
}

/**
 * The activity note: the operator's reason first, because that is what a
 * reader wants, then the diff. Truncated to fit the column with the reason
 * preserved - a clipped list of fields is still useful, a clipped reason is
 * not.
 */
export function buildEditNote(reason: string, changes: string[]): string {
  const head = reason.trim();
  const body = changes.join('; ');
  const note = body === '' ? head : `${head} — ${body}`;

  if (note.length <= MAX_ACTIVITY_NOTE) return note;

  return `${note.slice(0, MAX_ACTIVITY_NOTE - 1).trimEnd()}…`;
}
