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
  // Use server-side aggregation RPC instead of fetching all raw rows.
  // get_unit_ledger_balances() returns one row per (unit_id, bill_type)
  // with a pre-computed net balance, avoiding large payload transfers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (client as any).rpc('get_unit_ledger_balances', {
    p_association_id: associationId,
    p_unit_ids: unitIds,
  });

  if (!data) return [];

  // Nested map avoids fragile string-concatenation keys.
  const perUnitType = new Map<string, Map<string, number>>();
  for (const row of data as {
    unit_id: string;
    bill_type: string;
    net: number;
  }[]) {
    if (!perUnitType.has(row.unit_id)) perUnitType.set(row.unit_id, new Map());
    perUnitType.get(row.unit_id)!.set(row.bill_type, Number(row.net));
  }

  const unitMap = new Map<string, UnitCashLedgerBalance>();
  for (const [unit_id, byType] of perUnitType) {
    for (const [bill_type, bal] of byType) {
      if (bal === 0) continue;
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
  }

  return Array.from(unitMap.values()).filter(
    (u) => u.totalCredit > 0 || u.totalDue > 0,
  );
}
