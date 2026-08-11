/**
 * Shared Supabase select shapes for the billing routes.
 *
 * Every billing surface used to declare its own select string. That is how a
 * `bill_line_items` join drifted into the query feeding the unit tree — whose
 * own type comment says line items are deliberately excluded to keep the
 * payload small. Keeping the shapes here makes the cost of each query visible
 * in one place.
 *
 * None of these join `bill_line_items`. Line items are loaded on demand by
 * `fetchBillDetailAction` when a bill row is expanded.
 */

/**
 * Smallest shape that can derive a bill's display status and outstanding
 * amount. Used by the KPI tiles, which render no bill identity at all.
 *
 * `advance_applied` is not optional: `billSettledAmount` counts advance credit
 * as real settlement, so omitting it makes an advance-settled bill read as
 * unpaid — and, past its due date, as overdue.
 */
export const BILL_AMOUNTS_SELECT =
  'total_amount, paid_amount, advance_applied, status, due_date, period, bill_type';

/**
 * Adds the identity and per-row action columns the unit tree renders.
 * Matches the `UnitBill` interface in `unit-billing-types.ts`.
 */
export const UNIT_BILL_SELECT =
  'id, unit_id, period, bill_no, bill_type, total_amount, paid_amount, advance_applied, gst_amount, status, due_date, pdf_url';

/**
 * A single bill flattened for list rendering and CSV export.
 *
 * `unit_no` is resolved from the separately-fetched units list rather than a
 * `units(unit_no)` join, so the bills query stays join-free.
 */
export interface BillRow {
  id: string;
  unit_id: string;
  period: string;
  bill_no: string;
  bill_type: string;
  unit_no: string;
  total_amount: number;
  paid_amount: number;
  advance_applied: number;
  gst_amount: number | null;
  status: string;
  due_date: string;
}

/** Row shape returned by `get_association_cash_ledger_balances`. */
interface CashLedgerBalanceRow {
  unit_id: string | null;
  balance: number | string | null;
}

/**
 * Collapses the per-(unit, bill_type) balances from
 * `get_association_cash_ledger_balances` into a net advance per unit.
 *
 * The RPC aggregates in Postgres and already drops zero balances, so this
 * replaces fetching the whole `cash_ledger` table just to sum it client-side.
 * Negative nets mean the unit owes money rather than holding credit; those are
 * clamped to zero because callers surface this as "advance balance".
 */
export function advanceByUnitFromBalances(
  rows: CashLedgerBalanceRow[] | null,
): Map<string, number> {
  const byUnit = new Map<string, number>();

  for (const row of rows ?? []) {
    if (!row.unit_id) continue;
    const balance = Number(row.balance ?? 0);
    if (!Number.isFinite(balance)) continue;
    byUnit.set(row.unit_id, (byUnit.get(row.unit_id) ?? 0) + balance);
  }

  for (const [unitId, net] of byUnit) {
    byUnit.set(unitId, Math.max(0, net));
  }

  return byUnit;
}
