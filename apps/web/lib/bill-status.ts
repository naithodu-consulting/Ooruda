export function displayBillStatus(bill: {
  status: string;
  due_date: string;
}): string {
  if (
    bill.status === 'Unpaid' &&
    bill.due_date < new Date().toISOString().slice(0, 10)
  ) {
    return 'Overdue';
  }

  return bill.status;
}

export function billStatusBadgeVariant(
  status: string,
): 'secondary' | 'outline' | 'destructive' | 'default' {
  switch (status) {
    case 'Paid':
      return 'secondary';
    case 'Overdue':
      return 'destructive';
    case 'Partial':
      return 'default';
    default:
      return 'outline';
  }
}
