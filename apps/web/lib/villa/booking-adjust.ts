import { TAX_MODE, type TaxMode, flat18 } from './pricing';

/**
 * Adjusting a booking's money after it was taken (edit booking Phase 2).
 *
 * Pure: what an adjustment is allowed to be, and the arithmetic that follows
 * from it, are decided here without touching either database, so they are
 * unit-tested directly (`booking-adjust.test.ts`).
 *
 * The tax is recomputed with `flat18` from `lib/villa/pricing.ts` - the same
 * function that priced the stay in the first place - rather than a second
 * copy, so an adjusted total cannot drift from a quoted one. When the per-night
 * GST slab is switched on (together with the booking site, never alone), this
 * follows `TAX_MODE` with it.
 *
 * WHAT IS NOT HERE. Itemised add-ons - meals, a BBQ, an extra bed - have no
 * home in the schema: `villa_addons` is a Settings price list with no booking
 * linkage, and neither database has a `booking_addons` table. A surcharge is
 * therefore folded into the stay charge rather than itemised, and real add-on
 * lines need a table of their own (tracked as "Add-on history for invoices"
 * in OORUDA_VILLA_TODO). Dates are Phase 3 and need the site's atomic
 * availability check.
 */

/** A booking's money, in paise, as the booking site holds it. */
export interface BookingMoney {
  basePaise: number;
  extraGuestPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/** What the operator is changing. Tax and total are derived, never entered. */
export interface MoneyAdjustment {
  basePaise: number;
  extraGuestPaise: number;
  discountPaise: number;
}

export interface AdjustRefusal {
  code:
    | 'DISCOUNT_TOO_LARGE'
    | 'BELOW_RECEIPTS'
    | 'SLAB_MODE'
    | 'BASIS_NOT_REPRODUCIBLE';
  message: string;
}

/**
 * Paise, to the paisa. NOT rounded to whole rupees: the activity entry this
 * feeds is read with a tax return open, and 18% GST on a sub-rupee movement is
 * exactly where the paise land. Rounding made an adjustment of ₹1,000.00 to
 * ₹1,000.49 log as "₹1,000 → ₹1,000" while the toast said the change was
 * recorded.
 */
const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * The taxable value: the stay plus extra guests, less the discount.
 *
 * The discount comes off BEFORE GST - settled 2026-10-03 and matching the
 * booking site's `applyDiscount`, so the tax follows the amount actually
 * payable rather than a value the guest was never charged.
 */
export function taxableValue(adjustment: MoneyAdjustment): number {
  return (
    adjustment.basePaise + adjustment.extraGuestPaise - adjustment.discountPaise
  );
}

/** The whole money picture implied by an adjustment. */
export function recomputeMoney(
  adjustment: MoneyAdjustment,
  nights: number,
  taxMode: TaxMode = TAX_MODE,
): BookingMoney {
  const taxable = taxableValue(adjustment);

  // Flat 18% only. The per-night slab cannot be derived from a lump sum: it
  // chooses 5% or 18% per unit per night from that night's own charge, so a
  // stay whose nights are priced differently - a weekend inside a weekday
  // stay, or a seasonal rule - has no single answer, and averaging the total
  // across the nights would land on the wrong side of the ₹7,500 ceiling for
  // some of them. Callers must check `adjustmentsAvailable` first; this
  // asserts rather than guesses, and the UI never reaches it.
  if (taxMode !== 'site_flat_18') {
    throw new Error('recomputeMoney: only site_flat_18 is supported');
  }

  const gst = flat18(taxable, nights);

  return {
    basePaise: adjustment.basePaise,
    extraGuestPaise: adjustment.extraGuestPaise,
    discountPaise: adjustment.discountPaise,
    taxPaise: gst.taxPaise,
    totalPaise: taxable + gst.taxPaise,
  };
}

/**
 * Whether this adjustment may be saved, or why not.
 *
 * BELOW_RECEIPTS is the one that matters. Dropping a total below the money
 * already banked would leave the booking owing the guest without any refund
 * having been made, and the ledger would read as a negative balance that no
 * receipt explains. Refunding is its own action, with its own record, and this
 * must not become a silent back door to it.
 */
/**
 * Whether adjusting an amount is available at all under this tax mode.
 *
 * Checked by the UI before the control is offered and by the service before it
 * computes: the slab needs per-night figures this form does not collect.
 */
export function adjustmentsAvailable(taxMode: TaxMode = TAX_MODE): boolean {
  return taxMode === 'site_flat_18';
}

/**
 * Does the booking's stored tax follow from its own figures?
 *
 * If not, this stay was not priced on the basis the form recomputes with - a
 * row created under the per-night slab, a legacy import, something entered by
 * hand. Saving with no edits at all would then silently restate `tax_amount`
 * and `total_amount`, and the activity log would attribute that restatement to
 * an operator who changed nothing.
 */
export function basisIsReproducible(
  stored: BookingMoney,
  nights: number,
  taxMode: TaxMode = TAX_MODE,
): boolean {
  if (!adjustmentsAvailable(taxMode)) return false;

  const recomputed = recomputeMoney(stored, nights, taxMode);

  return (
    recomputed.taxPaise === stored.taxPaise &&
    recomputed.totalPaise === stored.totalPaise
  );
}

export function checkAdjustment(args: {
  next: MoneyAdjustment;
  /** Money received net of refunds, in paise. */
  receivedPaise: number;
  nights: number;
  taxMode?: TaxMode;
}): AdjustRefusal | null {
  const { next, receivedPaise, nights, taxMode } = args;

  if (next.discountPaise > next.basePaise + next.extraGuestPaise) {
    return {
      code: 'DISCOUNT_TOO_LARGE',
      message: 'The discount cannot be more than the stay and extra guests.',
    };
  }

  // No separate negative-total guard: `taxableValue` is below zero exactly
  // when the discount exceeds the stay and extra guests, which the branch
  // above has already refused. A second branch for it read as a guard and was
  // unreachable, so it is gone rather than left to mislead. If a signed term
  // is ever added here - a deposit, or a credit note in M5b - a real check
  // belongs back in, placed where it can actually fire.
  const money = recomputeMoney(next, nights, taxMode);

  if (money.totalPaise < receivedPaise) {
    return {
      code: 'BELOW_RECEIPTS',
      message:
        `That brings the total to ${rupees(money.totalPaise)}, below the ` +
        `${rupees(receivedPaise)} already received. Record the refund first, ` +
        `then adjust the total.`,
    };
  }

  return null;
}

/** What is still owed, never negative. */
export function balanceDue(money: BookingMoney, receivedPaise: number): number {
  return Math.max(0, money.totalPaise - receivedPaise);
}

const LINES: { key: keyof BookingMoney; label: string }[] = [
  { key: 'basePaise', label: 'Stay charge' },
  { key: 'extraGuestPaise', label: 'Extra guests' },
  { key: 'discountPaise', label: 'Discount' },
  { key: 'taxPaise', label: 'GST' },
  { key: 'totalPaise', label: 'Total' },
];

/**
 * Field-level diff for the activity log, in rupees.
 *
 * Every money line is named with both values, including the derived ones: the
 * question asked of this entry later is "who changed the total, from what, to
 * what, and why", often with a tax return open.
 */
export function describeMoneyChange(
  before: BookingMoney,
  after: BookingMoney,
): string[] {
  const changes: string[] = [];

  for (const { key, label } of LINES) {
    if (before[key] === after[key]) continue;

    changes.push(`${label}: ${rupees(before[key])} → ${rupees(after[key])}`);
  }

  return changes;
}
