import { getSupabaseServerClient } from '@kit/supabase/server-client';

export interface CashLedgerLineBalance {
  bill_type: string;
  amount: number;
}

export interface UnitCashLedgerBalance {
  unit_id: string;
  unit_no: string;
  totalCredit: number;
  totalDue: number;
  credits: CashLedgerLineBalance[];
  dues: CashLedgerLineBalance[];
}

/**
 * Loads per-unit cash ledger balances for the given units.
 * Aggregates per (unit_id, bill_type) — no cross-unit netting.
 */
export async function loadUnitLedgerBalances(
  associationId: string,
  units: { id: string; unit_no: string }[],
): Promise<UnitCashLedgerBalance[]> {
  if (units.length === 0) return [];

  const unitIds = units.map((u) => u.id);
  const unitNoMap = new Map(units.map((u) => [u.id, u.unit_no]));

  const client = getSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client as any)
    .from('cash_ledger')
    .select('unit_id, bill_type, amount, direction')
    .eq('association_id', associationId)
    .in('unit_id', unitIds);

  if (!data) return [];

  const perUnitType = new Map<string, number>();
  for (const row of data as {
    unit_id: string;
    bill_type: string;
    amount: number;
    direction: string;
  }[]) {
    const key = `${row.unit_id}:${row.bill_type}`;
    const delta = row.direction === 'credit' ? row.amount : -row.amount;
    perUnitType.set(key, (perUnitType.get(key) ?? 0) + delta);
  }

  const unitMap = new Map<string, UnitCashLedgerBalance>();
  for (const [key, bal] of perUnitType) {
    if (bal === 0) continue;
    const [unit_id, bill_type] = key.split(':') as [string, string];
    if (!unitMap.has(unit_id)) {
      unitMap.set(unit_id, {
        unit_id,
        unit_no: unitNoMap.get(unit_id) ?? unit_id,
        totalCredit: 0,
        totalDue: 0,
        credits: [],
        dues: [],
      });
    }
    const entry = unitMap.get(unit_id)!;
    if (bal > 0) {
      entry.totalCredit += bal;
      entry.credits.push({ bill_type, amount: bal });
    } else {
      entry.totalDue += Math.abs(bal);
      entry.dues.push({ bill_type, amount: Math.abs(bal) });
    }
  }

  return Array.from(unitMap.values()).filter(
    (u) => u.totalCredit > 0 || u.totalDue > 0,
  );
}
