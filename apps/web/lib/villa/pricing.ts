/**
 * Stay quotes for phone/WhatsApp bookings — a faithful port of the guest
 * site's `calculateBookingPrice` (villa-booking `src/lib/pricing-engine.ts`)
 * so a quote given here and a price shown online are the same for the same
 * stay. Integration contract §6.3 requires exactly that.
 *
 * Rules mirrored from the site:
 *   - per night: a seasonal rule covering it ([start, end)), else the
 *     weekend rate on Friday/Saturday, else the weekday rate
 *   - min stay: any rule overlapping the stay imposes its min_stay_nights
 *   - guests = adults + children (infants free); above max → refused
 *   - extra guests above base_occupancy pay extra_guest_rate per night;
 *     guests numbered extra_guest_tier2_from+ pay extra_guest_tier2_rate
 *
 * Tax: the site charges a flat 18% on (stay + extra guests), rounded once
 * (contract §6.3). Quotes do the SAME by default, because the contract
 * requires a phone quote and an online price to match. The per-night GST
 * slab (lib/villa/gst.ts: 5% ≤ ₹7,500, 18% above) is the legally precise
 * rule and is ready behind TAX_MODE; switch it on together with the site
 * (villa-booking TODO, "GST rate"), never here alone.
 *
 * Pure and in integer paise throughout; callers convert at the edge.
 */
import { computeStayGst, splitCgstSgst, type StayGst } from './gst';

/**
 * Guests the occupancy rules count: infants are free and uncapped.
 *
 * Exported because editing a booking has to apply the same two rules without
 * re-quoting the stay (`lib/villa/booking-edit.ts`). One definition, so a
 * party refused at booking time and the same party refused at edit time are
 * refused on the same arithmetic.
 */
export function billableGuests(guests: {
  adults: number;
  children: number;
}): number {
  return guests.adults + guests.children;
}

/** Guests charged the extra-guest rate, i.e. those above `base_occupancy`. */
export function extraGuestCount(
  guests: { adults: number; children: number },
  baseOccupancy: number,
): number {
  return Math.max(0, billableGuests(guests) - baseOccupancy);
}

/** The refusal shown when a party will not fit, worded once. */
export function maxOccupancyMessage(maxOccupancy: number): string {
  return `The villa sleeps at most ${maxOccupancy} guests (infants not counted).`;
}

export type TaxMode = 'site_flat_18' | 'per_night_slab';

/** Must equal what the guest site's pricing engine does today. */
export const TAX_MODE: TaxMode = 'site_flat_18';

/** The site's rule: 18% of the whole subtotal, rounded to the nearest paisa. */
function flat18(subtotalPaise: number, nights: number): StayGst {
  const taxPaise = Math.round((subtotalPaise * 18) / 100);
  const split = splitCgstSgst(taxPaise);

  return {
    nights: [],
    lines: [
      { rate: 18, nights, taxablePaise: subtotalPaise, taxPaise, ...split },
    ],
    taxablePaise: subtotalPaise,
    taxPaise,
    ...split,
    totalPaise: subtotalPaise + taxPaise,
  };
}

export interface PricingProperty {
  base_nightly_rate: number;
  weekend_nightly_rate: number;
  base_occupancy: number;
  max_occupancy: number;
  extra_guest_rate: number;
  extra_guest_tier2_rate: number | null;
  extra_guest_tier2_from: number | null;
}

export interface PricingRuleInput {
  rule_name: string;
  start_date: string;
  end_date: string; // exclusive
  nightly_rate: number;
  min_stay_nights: number | null;
}

export interface QuoteNight {
  date: string;
  ratePaise: number;
  isWeekend: boolean;
  rule?: string;
}

export interface StayQuote {
  nights: QuoteNight[];
  numNights: number;
  guests: number;
  extraGuests: number;
  basePaise: number;
  extraGuestPaise: number;
  gst: StayGst;
  taxPaise: number;
  totalPaise: number;
}

export type QuoteError =
  | { code: 'INVALID_DATES'; message: string }
  | { code: 'MAX_OCCUPANCY'; message: string }
  | { code: 'MIN_STAY'; message: string; minStay: number; rule: string }
  | { code: 'NO_GUESTS'; message: string };

const DAY_MS = 86_400_000;

function ymdToUtc(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`);
}

function nightlyRate(
  property: PricingProperty,
  rules: readonly PricingRuleInput[],
  date: string,
): QuoteNight {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 5 = Fri, 6 = Sat
  const isWeekend = day === 5 || day === 6;
  const rule = rules.find((r) => date >= r.start_date && date < r.end_date);

  return {
    date,
    isWeekend,
    rule: rule?.rule_name,
    ratePaise: rule
      ? rule.nightly_rate
      : isWeekend
        ? property.weekend_nightly_rate
        : property.base_nightly_rate,
  };
}

export function quoteStay(input: {
  property: PricingProperty;
  rules: readonly PricingRuleInput[];
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  taxMode?: TaxMode;
}): { ok: true; quote: StayQuote } | { ok: false; error: QuoteError } {
  const { property, rules, checkIn, checkOut } = input;
  const start = ymdToUtc(checkIn);
  const end = ymdToUtc(checkOut);

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DATES',
        message: 'Check-out must be after check-in.',
      },
    };
  }

  const adults = Math.max(0, Math.trunc(input.adults));
  const children = Math.max(0, Math.trunc(input.children));
  const guests = billableGuests({ adults, children });

  if (adults < 1) {
    return {
      ok: false,
      error: {
        code: 'NO_GUESTS',
        message: 'A booking needs at least one adult.',
      },
    };
  }

  if (guests > property.max_occupancy) {
    return {
      ok: false,
      error: {
        code: 'MAX_OCCUPANCY',
        message: maxOccupancyMessage(property.max_occupancy),
      },
    };
  }

  const numNights = Math.round((end - start) / DAY_MS);

  for (const rule of rules) {
    const overlaps =
      start < ymdToUtc(rule.end_date) && end > ymdToUtc(rule.start_date);
    const minStay = rule.min_stay_nights ?? 0;

    if (overlaps && minStay > 0 && numNights < minStay) {
      return {
        ok: false,
        error: {
          code: 'MIN_STAY',
          message: `"${rule.rule_name}" needs a minimum stay of ${minStay} nights.`,
          minStay,
          rule: rule.rule_name,
        },
      };
    }
  }

  const nights: QuoteNight[] = Array.from({ length: numNights }, (_, i) => {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    return nightlyRate(property, rules, date);
  });

  // Extra guests, tiered exactly as the site's engine does it.
  const extraGuests = extraGuestCount(
    { adults, children },
    property.base_occupancy,
  );
  const tier2From = property.extra_guest_tier2_from;
  const tier2Count =
    tier2From != null && property.extra_guest_tier2_rate != null
      ? Math.min(extraGuests, Math.max(0, guests - tier2From + 1))
      : 0;
  const tier1Count = extraGuests - tier2Count;
  const extraPerNight =
    tier1Count * property.extra_guest_rate +
    tier2Count * (property.extra_guest_tier2_rate ?? 0);

  const basePaise = nights.reduce((sum, n) => sum + n.ratePaise, 0);
  const extraGuestPaise = extraPerNight * numNights;

  const gst =
    (input.taxMode ?? TAX_MODE) === 'site_flat_18'
      ? flat18(basePaise + extraGuestPaise, numNights)
      : computeStayGst(
          nights.map((n) => ({
            date: n.date,
            ratePaise: n.ratePaise,
            extrasPaise: extraPerNight,
          })),
        );

  return {
    ok: true,
    quote: {
      nights,
      numNights,
      guests,
      extraGuests,
      basePaise,
      extraGuestPaise,
      gst,
      taxPaise: gst.taxPaise,
      totalPaise: basePaise + extraGuestPaise + gst.taxPaise,
    },
  };
}
