import { badgeExtras } from '@kit/ui/badge-extras';

import { todayInBillingZone } from './billing-dates';

interface BillAmounts {
  status: string;
  due_date: string;
  total_amount?: number;
  paid_amount?: number;
  /**
   * Portion of the bill settled from the unit's advance credit rather than by a
   * payment row. This is real settlement - it must be counted alongside
   * `paid_amount`, otherwise an advance-settled bill reads as unpaid.
   */
  advance_applied?: number;
}

/**
 * Amount actually settled against a bill: cash/online payments plus any advance
 * credit applied to it.
 */
export function billSettledAmount(bill: BillAmounts): number {
  return (bill.paid_amount ?? 0) + (bill.advance_applied ?? 0);
}

/** Amount still genuinely owed on a bill, never negative. */
export function billOutstanding(bill: BillAmounts): number {
  return Math.max(0, (bill.total_amount ?? 0) - billSettledAmount(bill));
}

export function displayBillStatus(bill: BillAmounts): string {
  const settled = billSettledAmount(bill);
  let effectiveStatus = bill.status;

  // Only derive from amounts when the caller actually selected them. Defaulting
  // a missing total to a sentinel made every amount-less row compare as fully
  // settled and report "Paid", silently hiding overdue bills.
  if (bill.total_amount != null) {
    const total = bill.total_amount;

    if (total === 0) return 'Paid';

    // Prefer amounts over the stored status - the DB status can lag behind
    // payments. Fully settled by amount means Paid whatever the column says.
    if (settled >= total) return 'Paid';

    // DB status='Paid' but amount still outstanding → reclassify.
    if (bill.status === 'Paid') {
      effectiveStatus = settled > 0 ? 'Partial' : 'Unpaid';
    }
  }

  const isPastDue = bill.due_date < todayInBillingZone();
  if (
    isPastDue &&
    (effectiveStatus === 'Unpaid' ||
      effectiveStatus === 'Partial' ||
      effectiveStatus === 'Overdue')
  ) {
    return 'Overdue';
  }

  return effectiveStatus;
}

// className for the status Badge, e.g. <Badge variant="outline" className={billStatusBadgeClassName(status)}>
export function billStatusBadgeClassName(status: string): string | undefined {
  switch (status) {
    case 'Paid':
      return badgeExtras.success;
    case 'Partial':
      return badgeExtras.warning;
    case 'Overdue':
      return badgeExtras.danger;
    case 'Void':
      return 'border-muted-foreground/30 text-muted-foreground line-through';
    default:
      return undefined;
  }
}
