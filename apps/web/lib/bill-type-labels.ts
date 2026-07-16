export const BILL_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  water: 'Water',
  other_charges: 'Other Charges',
};

export function billTypeLabel(key: string): string {
  return BILL_TYPE_LABELS[key] ?? key;
}
