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

/** Returns "DD/MM/YYYY" */
export function formatShortDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Returns "01/06/2026 - 30/06/2026" from a 'YYYY-MM' period string. */
export function formatPeriodDateRange(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  return `${formatShortDate(firstDay)} - ${formatShortDate(lastDay)}`;
}
