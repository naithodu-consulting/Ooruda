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

/** Returns "Jun 2026" from a 'YYYY-MM' period string. */
export function formatShortMonthYear(period: string): string {
  const date = new Date(`${period}-01T00:00:00`);
  return date.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Returns the previous month as a 'YYYY-MM' string.
 * Used for deriving the reading month from the billing period when
 * period_start / period_end are not explicitly stored.
 */
export function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(year, month - 2, 1)); // month-2 because JS months are 0-indexed
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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

/** Returns "Ground Floor", "Basement N", or "2nd Floor" / "3rd Floor" / "11th Floor" etc. */
export function ordinalFloorLabel(floor: number): string {
  if (floor === 0) return 'Ground Floor';
  if (floor < 0) return `Basement ${Math.abs(floor)}`;

  const remainder100 = floor % 100;
  const remainder10 = floor % 10;
  let suffix = 'th';
  if (remainder100 < 11 || remainder100 > 13) {
    if (remainder10 === 1) suffix = 'st';
    else if (remainder10 === 2) suffix = 'nd';
    else if (remainder10 === 3) suffix = 'rd';
  }

  return `${floor}${suffix} Floor`;
}
