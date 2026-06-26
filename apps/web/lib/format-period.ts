/**
 * Converts a YYYY-MM period string to a human-readable label like "June 2026".
 * Uses en-IN locale to match the app's regional context.
 */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
