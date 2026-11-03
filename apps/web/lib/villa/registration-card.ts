import type { RegistrationCardPdfData } from '@kit/pdf-templates';

import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';

import { ID_DOC_TYPE_LABELS, type IdDocType } from './guest-ids';
import { fromPaise } from './money';

/**
 * Turns one booking into the facts its villa's registration card prints.
 *
 * Pure: everything it needs is passed in, so the field decisions below are
 * unit-testable without a database. The I/O lives in the booking route's
 * loader (`registration-card-data.ts`).
 *
 * What it deliberately leaves blank — salutation, last name, arrival from,
 * next destination, purpose of visit, permanent address, nationality, date of
 * birth and the ID number — is not missing data. We do not hold any of it,
 * and the card is the instrument that collects it: the guest fills those in
 * and signs on arrival.
 */

export interface RegistrationCardBooking {
  bookingCode: string | null;
  referenceNumber: string;
  guestName: string;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  guestEmail: string;
  /** As the booking site stores it: 10 digits for an Indian mobile. */
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  /** All paise, as the site stores them. */
  baseAmountPaise: number;
  extraGuestAmountPaise: number;
  discountAmountPaise: number;
  specialRequests?: string | null;
  channel?: string | null;
}

export interface RegistrationCardLegal {
  /** villa_properties.name, e.g. "Villa 19". */
  villaName: string;
  legalName: string | null;
  legalAddress: string | null;
  gstin: string | null;
  supportEmail: string | null;
  whatsappNumber: string | null;
}

export interface RegistrationCardStayRules {
  /** 'HH:MM:SS' as the booking site holds it, or null. */
  checkInTime: string | null;
  checkOutTime: string | null;
  includedGuests: number;
  maxGuests: number;
}

export interface RegistrationCardInput {
  legal: RegistrationCardLegal;
  booking: RegistrationCardBooking;
  rules: RegistrationCardStayRules;
  /** bookings.guest_company on the site, when the guest gave one. */
  company: string | null;
  /** bookings.guest_gstin on the site. */
  guestGstin: string | null;
  /** doc_type of the primary guest's ID on file, e.g. 'aadhaar'. */
  govtIdType: string | null;
  /**
   * Distinct payment modes recorded against this booking so far (voided
   * receipts excluded by the caller).
   */
  paymentModes: string[];
}

/**
 * '14:00:00' → '2:00 PM'. Returns null for anything that is not a time, so a
 * malformed value prints the date alone rather than "15 Nov 2026, Invalid".
 */
export function formatTimeOfDay(time: string | null): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time?.trim() ?? '');

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** '2026-11-15' + '14:00:00' → '15 Nov 2026, 2:00 PM' (date alone if no time). */
function formatDateAndTime(date: string, time: string | null): string {
  const clock = formatTimeOfDay(time);
  const day = formatDateReadable(date);

  return clock ? `${day}, ${clock}` : day;
}

/**
 * Prints an Indian number the way the villa's own letterhead does:
 * '+918050484123' and '8050484123' both become '+91 8050484123'. Anything
 * else is printed exactly as stored rather than guessed at.
 */
export function formatCardPhone(value: string | null): string | null {
  const raw = value?.replace(/[\s-]/g, '') ?? '';

  if (!raw) return null;

  const indian = /^(?:\+?91)?([6-9]\d{9})$/.exec(raw);

  return indian ? `+91 ${indian[1]}` : (value?.trim() ?? null);
}

/** '10 (8 adults, 2 children)', with infants named only when there are any. */
export function formatGuestCount(booking: {
  adults: number;
  children: number;
  infants: number;
}): string {
  const counted = booking.adults + booking.children;

  const parts = [`${booking.adults} adult${booking.adults === 1 ? '' : 's'}`];

  if (booking.children) {
    parts.push(
      `${booking.children} child${booking.children === 1 ? '' : 'ren'}`,
    );
  }

  if (booking.infants) {
    parts.push(`${booking.infants} infant${booking.infants === 1 ? '' : 's'}`);
  }

  return `${counted} (${parts.join(', ')})`;
}

/**
 * The per-night tariff the card states: what this stay is actually charged
 * per night before GST.
 *
 * Stay charge plus extra-guest charge, less the discount, divided by the
 * nights and rounded to the rupee. Nights are not all priced alike (weekend
 * and seasonal rates differ, and the discount applies to the stay as a
 * whole), so this is an average by construction and may match no single
 * night exactly — agreed, because the card states one figure. Always the
 * discounted amount; the pre-discount rate never appears.
 */
export function perNightTariff(
  booking: RegistrationCardBooking,
): string | null {
  if (booking.nights <= 0) return null;

  const chargedPaise =
    booking.baseAmountPaise +
    booking.extraGuestAmountPaise -
    booking.discountAmountPaise;

  if (chargedPaise <= 0) return null;

  // To the whole rupee, not the paisa: a card that states
  // "₹16,666.67 per night" reads as a system artefact, not as a tariff.
  const perNightPaise = Math.round(chargedPaise / booking.nights / 100) * 100;

  // A stay charged less than a rupee a night is a data problem, not a tariff.
  if (perNightPaise <= 0) return null;

  // "+ GST" is not decoration: the figure is the pre-tax charge, and a bare
  // rupee amount on a document the guest signs reads as the all-in price.
  // Deliberately not "+ 18% GST" - the rate is slab-dependent (lib/villa/gst.ts)
  // and the card must not commit to one.
  return `${formatINR(fromPaise(perNightPaise))} per night + GST`;
}

export function buildRegistrationCard(
  input: RegistrationCardInput,
): RegistrationCardPdfData {
  const { booking, legal, rules } = input;

  const isAirbnb =
    ['airbnb', 'channel'].includes(
      booking.channel?.trim().toLowerCase() ?? '',
    ) ||
    Boolean(
      booking.bookingCode?.startsWith('HM') ||
      booking.referenceNumber?.startsWith('HM') ||
      (booking as { sourceFeedId?: string | null }).sourceFeedId,
    );

  // Company and GSTIN share one box on the sheet, and the box's own footnote
  // asks for the GST details, so both go in when the guest gave them.
  const companyInfo =
    [
      clamp(blankToNull(input.company), COMPANY_LIMIT),
      input.guestGstin ? `GSTIN: ${input.guestGstin.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n') || null;

  // Mode of payment: 'Airbnb' for Airbnb bookings. For direct bookings, populated
  // when recorded in payments or 'Online' for website bookings.
  const modes = [...new Set(input.paymentModes)];
  const modeOfPayment = isAirbnb
    ? 'Airbnb'
    : modes.length === 1 && modes[0]
      ? (CARD_PAYMENT_MODES[modes[0]] ?? modes[0])
      : booking.channel?.trim().toLowerCase() === 'online'
        ? 'Online'
        : null;

  // Extract salutation, first name, last name intelligently if not already split.
  let salutation = blankToNull(booking.salutation);
  let firstName = blankToNull(booking.firstName);
  let lastName = blankToNull(booking.lastName);

  // If salutation is missing, check if firstName starts with a title (e.g. "Mr. John" or "Mr John")
  if (!salutation && firstName) {
    const titleMatch = /^(Mr|Mrs|Ms)\.?\s+(.*)$/i.exec(firstName);
    if (titleMatch && titleMatch[1] && titleMatch[2]) {
      const title = titleMatch[1].toLowerCase();
      salutation = title === 'mrs' ? 'Mrs' : title === 'ms' ? 'Ms' : 'Mr';
      firstName = titleMatch[2].trim();
    }
  }

  if (!firstName && !lastName && booking.guestName) {
    const parts = booking.guestName.trim().split(/\s+/);
    if (parts.length > 0) {
      if (
        !salutation &&
        ['Mr', 'Mrs', 'Ms', 'Mr.', 'Mrs.', 'Ms.'].includes(parts[0]!)
      ) {
        const title = parts[0]!.replace('.', '').toLowerCase();
        salutation = title === 'mrs' ? 'Mrs' : title === 'ms' ? 'Ms' : 'Mr';
        parts.shift();
      }
      if (parts.length > 0) {
        firstName = parts[0]!;
        if (parts.length > 1) {
          lastName = parts.slice(1).join(' ');
        }
      }
    }
  }

  // Tariff: either 'Airbnb' or 'Direct booking' based on booking type (amount not shown).
  const tariff = isAirbnb ? 'Airbnb' : 'Direct booking';

  return {
    letterhead: {
      villaName: legal.villaName,
      legalName: blankToNull(legal.legalName),
      legalAddress: blankToNull(legal.legalAddress),
      phone: formatCardPhone(legal.whatsappNumber),
      email: blankToNull(legal.supportEmail),
      gstin: blankToNull(legal.gstin),
    },
    occupancy: {
      maxGuests: rules.maxGuests,
      includedGuests: rules.includedGuests,
    },
    bookingId: booking.bookingCode ?? booking.referenceNumber,
    guestName: booking.guestName.trim(),
    salutation,
    firstName: firstName || booking.guestName.trim(),
    lastName,
    email: booking.guestEmail.trim(),
    mobile: formatCardPhone(booking.guestPhone) ?? '',
    companyInfo,
    // The type only. The full number is never stored (only its last four,
    // masked), and a masked number on a form the guest signs reads as our
    // error - so the guest writes it, and staff check it against the ID.
    // Only a type we have a name for. An unrecognised doc_type would print
    // its raw key ("driving_licence_new") on a document the guest signs.
    govtIdType: ID_DOC_TYPE_LABELS[input.govtIdType as IdDocType] ?? null,
    arrival: formatDateAndTime(booking.checkIn, rules.checkInTime),
    departure: formatDateAndTime(booking.checkOut, rules.checkOutTime),
    numberOfGuests: formatGuestCount(booking),
    modeOfPayment,
    // Blank until the villa decides the amount: a security deposit is
    // collected at check-in and returned at check-out, and is NOT the tariff
    // advance (bookings.deposit_amount), so there is nothing to prefill from.
    securityDeposit: null,
    tariff,
    remarks: clamp(blankToNull(booking.specialRequests ?? null), REMARKS_LIMIT),
    checkInDateFormatted: formatDateReadable(booking.checkIn),
  };
}

/**
 * The card is one sheet, and the guest signs at the bottom of it. Free text
 * from the booking site has no length limit of its own, so a long special
 * request would grow its cell until the terms and the signature block were
 * pushed onto a second page - a page carrying neither the letterhead nor the
 * booking id. Capped here, in the one place that is unit-testable.
 */
/**
 * Payment modes as the card names them.
 *
 * Not the shared `paymentModeLabel`: that one says "Card (at the villa)",
 * which is useful in the ledger - it distinguishes a card swiped at the
 * property from the website's gateway - but reads as an instruction on a form
 * the guest fills in at the gate, where "at the villa" is where they already
 * are. The sheet asks how this stay was paid, and the answer is one word.
 */
const CARD_PAYMENT_MODES: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  card: 'Card',
  other: 'Other',
};

const REMARKS_LIMIT = 160;
const COMPANY_LIMIT = 70;

function clamp(value: string | null, limit: number): string | null {
  if (!value) return null;

  return value.length <= limit
    ? value
    : `${value.slice(0, limit - 1).trimEnd()}…`;
}

/** Trims, and turns blank into null so the template skips the line. */
function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim();

  return text ? text : null;
}
