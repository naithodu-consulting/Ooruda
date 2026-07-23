export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface CollectionRow {
  period: string;
  bill_type: string;
  bill_count: number;
  billed: number;
  collected: number;
}

export interface OutstandingBill {
  id: string;
  period: string;
  bill_no: string;
  bill_type: string;
  unit_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
}

export interface PaymentRow {
  id: string;
  paid_at: string;
  unit_no: string;
  bill_no: string;
  bill_type: string;
  amount: number;
  mode: string;
  reference_no: string | null;
  receipt_no: string | null;
}

export interface MescomRow {
  id: string;
  period: string;
  invoice_amount: number;
  block_consumption_units: number;
  rate: number | null;
}

export interface UnitConsumptionRow {
  unit_no: string;
  consumed_units: number;
  charged_amount: number;
  prev_reading: number | null;
  curr_reading: number | null;
}

// FY runs April–March in India.
export function fyPeriods(fy: string): { from: string; to: string } {
  const year = parseInt(fy, 10);
  return { from: `${year}-04`, to: `${year + 1}-03` };
}

export function currentFyStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04`;
}

export function currentFyEnd(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year + 1}-03`;
}

function toDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function nMonthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return toDate(d);
}

export function currentPeriod(): string {
  return toDate(new Date());
}

export const PRESET_RANGES = [
  { label: 'All Time', key: 'all_time' },
  { label: 'This FY', key: 'this_fy' },
  { label: 'Last FY', key: 'last_fy' },
  { label: 'Last 6 months', key: '6m' },
  { label: 'Last 3 months', key: '3m' },
] as const;

export type PresetKey = (typeof PRESET_RANGES)[number]['key'];

/**
 * Resolve a preset key to a date range.
 * "All Time" returns empty strings — callers must skip DB filters when from/to are empty.
 */
export function resolvePreset(key: PresetKey | string): DateRange {
  const now = new Date();
  const today = toDate(now);
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const fyStartYear = curMonth >= 3 ? curYear : curYear - 1;

  switch (key) {
    case 'all_time':
      return { from: '', to: '' };
    case 'this_fy':
      return { from: `${fyStartYear}-04-01`, to: `${fyStartYear + 1}-03-31` };
    case 'last_fy':
      return { from: `${fyStartYear - 1}-04-01`, to: `${fyStartYear}-03-31` };
    case '6m':
      return { from: nMonthsAgo(6), to: today };
    case '3m':
      return { from: nMonthsAgo(3), to: today };
    default:
      return { from: '', to: '' };
  }
}

/** Convert a YYYY-MM-DD date string to a YYYY-MM billing period string. */
export function dateToPeriod(date: string): string {
  return date.slice(0, 7);
}

export const BILL_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  other_charges: 'Other Charges',
  sinking_fund: 'Sinking Fund',
};

export const BILL_TYPE_COLORS: Record<string, string> = {
  maintenance: '#6366f1',
  electricity: '#f59e0b',
  other_charges: '#10b981',
  sinking_fund: '#ec4899',
};
