/**
 * Returns the list of YYYY-MM period strings matching the given duration key,
 * or null for "all time". Used by both billing and payments client filters.
 */
export function getPeriodsForDuration(duration: string): string[] | null {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const fmt = (y: number, m: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}`;

  switch (duration) {
    case 'current_month':
      return [fmt(currentYear, currentMonth)];
    case 'prev_month': {
      const d = new Date(currentYear, currentMonth - 1, 1);
      return [fmt(d.getFullYear(), d.getMonth())];
    }
    case 'last_3m':
      return Array.from({ length: 3 }, (_, i) => {
        const d = new Date(currentYear, currentMonth - i, 1);
        return fmt(d.getFullYear(), d.getMonth());
      });
    case 'last_6m':
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(currentYear, currentMonth - i, 1);
        return fmt(d.getFullYear(), d.getMonth());
      });
    case 'this_fy': {
      const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      return Array.from({ length: 12 }, (_, m) => {
        const d = new Date(startYear, 3 + m, 1);
        return fmt(d.getFullYear(), d.getMonth());
      });
    }
    case 'prev_fy': {
      const startYear = (currentMonth >= 3 ? currentYear : currentYear - 1) - 1;
      return Array.from({ length: 12 }, (_, m) => {
        const d = new Date(startYear, 3 + m, 1);
        return fmt(d.getFullYear(), d.getMonth());
      });
    }
    default:
      return null;
  }
}
