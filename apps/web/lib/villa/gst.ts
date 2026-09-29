/**
 * GST on villa accommodation (OORUDA_VILLA_PLAN.md §9).
 *
 * SAC 996311. Since 22 Sep 2025 (Notification 15/2025-Central Tax (Rate)):
 *   - value of supply per unit per day ≤ ₹7,500 → 5% (no input tax credit)
 *   - above ₹7,500                              → 18%
 *
 * The slab is decided per night on the ACTUAL value charged for that night —
 * after discount, including extra-guest / extra-bed charges — not on a
 * published tariff. A stay can therefore straddle slabs, and each night is
 * taxed at its own rate.
 *
 * Place of supply is the property's location (IGST Act s.12(3)), so tax is
 * always split equally into CGST + SGST.
 *
 * All arithmetic is in integer paise so rounding is exact and reproducible;
 * the villa-booking site's pricing engine must use the same rule (see that
 * repo's TODO, "GST rate").
 */

export const GST_SAC_ACCOMMODATION = '996311';

/** ₹7,500 in paise — nights at or below this are taxed at the lower slab. */
export const GST_LOWER_SLAB_CEILING_PAISE = 750_000;

export const GST_LOWER_RATE = 5;
export const GST_UPPER_RATE = 18;

export type GstRate = typeof GST_LOWER_RATE | typeof GST_UPPER_RATE;

export interface NightCharge {
  /** ISO date of the night (YYYY-MM-DD). */
  date: string;
  /** Room/villa rate for the night, paise. */
  ratePaise: number;
  /** Extra guest / extra bed charges for the night, paise. */
  extrasPaise?: number;
  /** Discount applied to the night, paise (positive number). */
  discountPaise?: number;
}

export interface TaxedNight {
  date: string;
  taxablePaise: number;
  rate: GstRate;
  taxPaise: number;
}

export interface RateLine {
  rate: GstRate;
  nights: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  taxPaise: number;
}

export interface StayGst {
  nights: TaxedNight[];
  /** One line per rate, as printed on the tax invoice. */
  lines: RateLine[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export function gstRateForNight(taxablePaise: number): GstRate {
  return taxablePaise <= GST_LOWER_SLAB_CEILING_PAISE
    ? GST_LOWER_RATE
    : GST_UPPER_RATE;
}

/** Round half up, in paise. */
function percentOf(paise: number, rate: number): number {
  return Math.floor((paise * rate + 50) / 100);
}

/**
 * Splits tax into CGST and SGST. An odd paisa goes to SGST so the halves
 * always sum to the tax exactly.
 */
export function splitCgstSgst(taxPaise: number): {
  cgstPaise: number;
  sgstPaise: number;
} {
  const cgstPaise = Math.floor(taxPaise / 2);
  return { cgstPaise, sgstPaise: taxPaise - cgstPaise };
}

export function computeStayGst(nights: readonly NightCharge[]): StayGst {
  const taxed: TaxedNight[] = nights.map((night) => {
    for (const [field, value] of [
      ['ratePaise', night.ratePaise],
      ['extrasPaise', night.extrasPaise ?? 0],
      ['discountPaise', night.discountPaise ?? 0],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative integer (paise)`);
      }
    }

    const taxablePaise =
      night.ratePaise + (night.extrasPaise ?? 0) - (night.discountPaise ?? 0);

    if (taxablePaise < 0) {
      throw new Error(`Discount exceeds the charge for ${night.date}`);
    }

    const rate = gstRateForNight(taxablePaise);

    return {
      date: night.date,
      taxablePaise,
      rate,
      taxPaise: percentOf(taxablePaise, rate),
    };
  });

  const byRate = new Map<GstRate, RateLine>();

  for (const night of taxed) {
    const line = byRate.get(night.rate) ?? {
      rate: night.rate,
      nights: 0,
      taxablePaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      taxPaise: 0,
    };

    line.nights += 1;
    line.taxablePaise += night.taxablePaise;
    line.taxPaise += night.taxPaise;
    byRate.set(night.rate, line);
  }

  const lines = [...byRate.values()]
    .sort((a, b) => a.rate - b.rate)
    .map((line) => ({ ...line, ...splitCgstSgst(line.taxPaise) }));

  const sum = (key: 'taxablePaise' | 'cgstPaise' | 'sgstPaise' | 'taxPaise') =>
    lines.reduce((total, line) => total + line[key], 0);

  const taxablePaise = sum('taxablePaise');
  const taxPaise = sum('taxPaise');

  return {
    nights: taxed,
    lines,
    taxablePaise,
    cgstPaise: sum('cgstPaise'),
    sgstPaise: sum('sgstPaise'),
    taxPaise,
    totalPaise: taxablePaise + taxPaise,
  };
}
