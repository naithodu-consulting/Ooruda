import {
  currentFinancialYearLabel,
  previousFinancialYearLabel,
} from './financial-year';

export const BILL_STATUS_ITEMS = {
  all: 'All Statuses',
  collected: 'Collected',
  unpaid: 'Unpaid',
  paid: 'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
};

export const BILL_TYPE_FILTER_ITEMS = {
  all: 'All Types',
  electricity: 'Electricity',
  maintenance: 'Maintenance',
  other_charges: 'Other Charges',
};

export function getDurationItems() {
  return {
    all: 'All Time',
    current_month: 'Current Month',
    prev_month: 'Previous Month',
    last_3m: 'Last 3 Months',
    last_6m: 'Last 6 Months',
    this_fy: currentFinancialYearLabel(),
    prev_fy: previousFinancialYearLabel(),
  };
}
