import { badgeExtras } from '@kit/ui/badge-extras';

import { todayInBillingZone } from './billing-dates';

export function displayBillStatus(bill: {
  status: string;
  due_date: string;
  total_amount?: number;
  paid_amount?: number;
}): string {
  const total = bill.total_amount ?? -1;
  const paid = bill.paid_amount ?? 0;

  if (total === 0) return 'Paid';

  // Always derive from actual amounts — the DB status can lag behind payments.
  // If fully paid by amount, it's Paid regardless of what the DB status says.
  if (paid >= total) return 'Paid';

  // DB status='Paid' but amount outstanding → reclassify.
  let effectiveStatus = bill.status;
  if (bill.status === 'Paid' && paid < total) {
    effectiveStatus = paid > 0 ? 'Partial' : 'Unpaid';
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
    default:
      return undefined;
  }
}
