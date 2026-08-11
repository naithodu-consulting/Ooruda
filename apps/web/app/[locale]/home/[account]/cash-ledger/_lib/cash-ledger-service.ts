// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface CashLedgerEntry {
  association_id: string;
  unit_id: string;
  entry_type: 'due' | 'advance_payment' | 'advance_applied' | 'due_payment';
  bill_type: string;
  amount: number;
  direction: 'debit' | 'credit';
  reference_bill_id?: string | null;
  paid_by_user_id?: string | null;
  paid_by_name: string;
  entry_date: string; // YYYY-MM-DD
  notes?: string | null;
  created_by?: string | null;
}

/**
 * Returns the net cash-ledger balance for a unit+bill_type.
 *   positive → credit (advance available)
 *   negative → debit  (dues outstanding)
 *   zero     → settled
 */
export async function getCashLedgerBalance(
  client: AnyClient,
  unitId: string,
  billType: string,
): Promise<number> {
  const { data, error } = await client.rpc('get_cash_ledger_balance', {
    p_unit_id: unitId,
    p_bill_type: billType,
  });

  if (error) {
    throw new Error(`getCashLedgerBalance failed: ${error.message}`);
  }

  return (data as number) ?? 0;
}

/**
 * Creates a single cash ledger entry and returns its id.
 */
export async function createCashLedgerEntry(
  client: AnyClient,
  entry: CashLedgerEntry,
): Promise<string> {
  const { data, error } = await client
    .from('cash_ledger')
    .insert(entry)
    .select('id')
    .single();

  if (error) {
    throw new Error(`createCashLedgerEntry failed: ${error.message}`);
  }

  return (data as { id: string }).id;
}
