import type { StatementEntry } from '../statement-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface BuildStatementParams {
  /** Supabase client. RLS-enforced client is expected - access is scoped by policy. */
  client: AnyClient;
  associationId: string;
  /** Units to build the statement for. Callers scope this (resident: own units; association: a picked unit). */
  unitIds: string[];
  /** unit_id → unit_no, for labelling entries. */
  unitNoMap: Map<string, string>;
  /**
   * How the running balance accumulates.
   *
   * 'per_unit' (default) keeps an independent balance per unit - correct when
   * each unit's statement is read on its own. 'combined' accumulates a single
   * association-wide balance across every entry in date order, which is what an
   * "All Units" overview needs; a per-unit balance interleaved across units
   * would jump around and read as nonsense.
   */
  balanceMode?: 'per_unit' | 'combined';
}

/**
 * Builds a formal ledger statement: bills raised are debits, payments received
 * are credits, plus advance deposits/drawdowns from the cash ledger. Returns
 * entries newest-first with a per-unit running balance already computed.
 *
 * Extracted from the resident statement page so the association-side Reports
 * tab can reuse the identical accounting rules - particularly advance netting
 * and reversal handling, which are easy to get subtly wrong.
 */
export async function buildStatementEntries({
  client,
  associationId,
  unitIds,
  unitNoMap,
  balanceMode = 'per_unit',
}: BuildStatementParams): Promise<StatementEntry[]> {
  if (unitIds.length === 0) return [];

  // Bills → debit entries (due raised). Payments nested inside → credit entries.
  // Voided bills are excluded - they carry no outstanding obligation.
  const [{ data: billRows }, { data: advanceRows }] = await Promise.all([
    client
      .from('bills')
      .select(
        'id, unit_id, bill_type, bill_no, total_amount, generated_at, bill_line_items(description), payments(id, amount, mode, reference_no, paid_at, status, reversed_at, refunded_amount)',
      )
      .in('unit_id', unitIds)
      .eq('association_id', associationId)
      .neq('status', 'Void')
      .order('generated_at', { ascending: true }),
    // Cash ledger - advances and due payments (advance_payment deposits,
    // advance_applied drawdowns, due_payment cash credits, legacy due entries).
    // cash_ledger is a DB view not in generated types - cast required.
    (client as AnyClient)
      .from('cash_ledger')
      .select(
        'id, unit_id, entry_type, bill_type, amount, direction, entry_date, notes, reference_bill_id',
      )
      .in('unit_id', unitIds)
      .eq('association_id', associationId)
      .in('entry_type', [
        'due',
        'advance_payment',
        'advance_applied',
        'due_payment',
      ])
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  // Sum of advance_applied amounts per bill - used to compute the remaining
  // bill debit after advance has been partially or fully applied.
  const advanceAppliedByBillId = new Map<string, number>();
  for (const e of (advanceRows ?? []) as {
    entry_type: string;
    reference_bill_id: string | null;
    amount: number;
  }[]) {
    if (e.entry_type === 'advance_applied' && e.reference_bill_id) {
      advanceAppliedByBillId.set(
        e.reference_bill_id,
        (advanceAppliedByBillId.get(e.reference_bill_id) ?? 0) +
          Number(e.amount),
      );
    }
  }

  const raw: Omit<StatementEntry, 'runningBalance'>[] = [];

  for (const bill of (billRows ?? []) as AnyClient[]) {
    const unitNo = unitNoMap.get(bill.unit_id) ?? '?';
    const billType = (bill.bill_type as string) ?? 'other_charges';

    // Derive a human-readable charge name from line items.
    // For electricity/maintenance the bill_type label is clear; for other_charges
    // we surface the actual charge names (e.g. "Water Charges", "Parking Fee").
    const lineItems = (bill.bill_line_items as { description: string }[]) ?? [];
    const primaryDescriptions = lineItems
      .map((li) => li.description)
      .filter((d) => !/gst|tax/i.test(d));
    const uniqueDescriptions = [...new Set(primaryDescriptions)];
    const charge_name =
      billType === 'other_charges' && uniqueDescriptions.length > 0
        ? uniqueDescriptions.join(', ')
        : null;

    // Debit: due raised when bill was generated.
    // If advance was applied (fully or partially), the advance_applied cash_ledger
    // entries already represent that portion as debits - including the full bill
    // amount here would double-count. Emit a debit only for the remaining amount
    // not covered by advance (0 if fully advance-paid, full amount if no advance).
    const totalAdvanceApplied = advanceAppliedByBillId.get(bill.id) ?? 0;
    const billDebitAmount = Number(bill.total_amount) - totalAdvanceApplied;
    if (billDebitAmount > 0) {
      raw.push({
        id: `bill-${bill.id}`,
        unit_id: bill.unit_id,
        unit_no: unitNo,
        entry_type: 'due',
        bill_type: billType,
        bill_no: bill.bill_no,
        charge_name,
        amount: billDebitAmount,
        direction: 'debit',
        entry_date: (bill.generated_at as string).slice(0, 10),
        notes: null,
        mode: null,
      });
    }

    // Credits: every payment recorded against this bill (including reversed ones).
    for (const p of (bill.payments as unknown as {
      id: string;
      amount: number;
      mode: string;
      reference_no: string | null;
      paid_at: string;
      status: string;
      reversed_at: string | null;
      refunded_amount: number | null;
    }[]) ?? []) {
      const refunded = Number(p.refunded_amount ?? 0);
      const isPartialRefund = p.status === 'active' && refunded > 0;
      raw.push({
        id: `payment-${p.id}`,
        unit_id: bill.unit_id,
        unit_no: unitNo,
        entry_type: 'due_payment',
        bill_type: billType,
        bill_no: bill.bill_no,
        charge_name,
        amount: Number(p.amount),
        direction: 'credit',
        entry_date: (p.paid_at as string).slice(0, 10),
        notes: p.reference_no ?? null,
        mode: p.mode,
        payment_status: isPartialRefund
          ? 'partial_refund'
          : (p.status as 'active' | 'reversed'),
        ...(isPartialRefund ? { refunded_amount: refunded } : {}),
      });
      // Full reversal: bill debit already represents the outstanding amount;
      // the reversed credit is excluded from balance via payment_status='reversed'.
      // Partial refund: the delta below nets the credit by subtracting refunded_amount.
    }
  }

  // Advance deposits, advance drawdowns, due-payment credits, and legacy due entries
  for (const e of (advanceRows as {
    id: string;
    unit_id: string;
    entry_type: string;
    bill_type: string;
    amount: number;
    direction: string;
    entry_date: string;
    notes: string | null;
    reference_bill_id: string | null;
  }[]) ?? []) {
    raw.push({
      id: `ledger-${e.id}`,
      unit_id: e.unit_id,
      unit_no: unitNoMap.get(e.unit_id) ?? '?',
      entry_type: e.entry_type as StatementEntry['entry_type'],
      bill_type: e.bill_type,
      bill_no: null,
      charge_name: null,
      amount: Number(e.amount),
      direction: e.direction as 'debit' | 'credit',
      entry_date: e.entry_date,
      notes: e.notes,
      mode: null,
    });
  }

  // Sort oldest-first, compute running balance per unit, then reverse.
  // On the same date: dues before payments (debit before credit).
  raw.sort((a, b) => {
    if (a.entry_date !== b.entry_date)
      return a.entry_date < b.entry_date ? -1 : 1;
    // Same date: debits first so balance dips before recovering
    if (a.direction !== b.direction) return a.direction === 'debit' ? -1 : 1;
    return 0;
  });

  const COMBINED_KEY = '__combined__';
  const perUnitBalance = new Map<string, number>();
  const entries: StatementEntry[] = raw.map((e) => {
    const balanceKey = balanceMode === 'combined' ? COMBINED_KEY : e.unit_id;
    const prev = perUnitBalance.get(balanceKey) ?? 0;
    let delta: number;
    if (e.direction === 'debit') {
      delta = -e.amount;
    } else if (e.payment_status === 'reversed') {
      delta = 0;
    } else if (e.payment_status === 'partial_refund' && e.refunded_amount) {
      delta = e.amount - e.refunded_amount;
    } else {
      delta = e.amount;
    }
    const next = prev + delta;
    perUnitBalance.set(balanceKey, next);
    return { ...e, runningBalance: next };
  });

  entries.reverse();

  return entries;
}
