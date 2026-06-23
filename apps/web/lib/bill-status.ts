import { badgeExtras } from '@kit/ui/badge-extras';

import { todayInBillingZone } from './billing-dates';

export function displayBillStatus(bill: {
  status: string;
  due_date: string;
}): string {
  const isPastDue = bill.due_date < todayInBillingZone();

  if (isPastDue && (bill.status === 'Unpaid' || bill.status === 'Partial')) {
    return 'Overdue';
  }

  return bill.status;
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
