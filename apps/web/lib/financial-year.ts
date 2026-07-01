/**
 * India's financial year runs April–March. Mirrors the `this_fy`/`prev_fy`
 * period math in payments/page.tsx and billing/page.tsx so the filter
 * labels always match the years those filters actually query.
 */
function financialYearStartYear(now: Date, yearsAgo: number): number {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return (currentMonth >= 3 ? currentYear : currentYear - 1) - yearsAgo;
}

/** e.g. `FY 2026-27` for the financial year starting April 2026. */
export function financialYearLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function currentFinancialYearLabel(now: Date = new Date()): string {
  return financialYearLabel(financialYearStartYear(now, 0));
}

export function previousFinancialYearLabel(now: Date = new Date()): string {
  return financialYearLabel(financialYearStartYear(now, 1));
}
