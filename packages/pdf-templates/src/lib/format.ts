const wholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const paiseFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(amount: number): string {
  return amount % 1 === 0
    ? wholeFormatter.format(amount)
    : paiseFormatter.format(amount);
}

export function formatDateLong(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatPeriodLabel(period: string): string {
  // period is 'YYYY-MM'
  const date = new Date(`${period}-01T00:00:00`);
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
