export const BILL_TYPE_LABELS: Record<string, string> = {
  // Uppercase short codes — used in bill_sequences and allocate_bill_no output
  MNT: 'Maintenance',
  ELT: 'Electricity',
  OTH: 'Other Charges',
  SNK: 'Sinking Fund',
  DGU: 'DG Usage',
  // Lowercase full names — used in bills.bill_type and cash_ledger.bill_type
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  water: 'Water',
  other_charges: 'Other Charges',
  sinking_fund: 'Sinking Fund',
  dg_usage: 'DG Usage',
};

/** Returns a human-readable label for a bill type code or full name, falling back gracefully. */
export function billTypeLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return (
    BILL_TYPE_LABELS[code] ??
    code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ')
  );
}
