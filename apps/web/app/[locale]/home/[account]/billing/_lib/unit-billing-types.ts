import { billTypeLabel } from '@kit/pdf-templates';

import { billOutstanding, displayBillStatus } from '~/lib/bill-status';

export { billTypeLabel };

/**
 * A single generated bill, without line items or payments.
 *
 * The server sends every bill for the association in this lightweight shape —
 * dropping the `bill_line_items` join keeps the initial payload small enough
 * that the whole unit → period → type tree can be built client-side with zero
 * additional fetches. Line items and payment history are loaded on demand when
 * a bill row is expanded (see `fetchBillDetailAction`).
 */
export interface UnitBill {
  id: string;
  unit_id: string;
  period: string;
  bill_no: string;
  bill_type: string;
  total_amount: number;
  paid_amount: number;
  advance_applied: number;
  gst_amount: number | null;
  status: string;
  due_date: string;
  pdf_url: string | null;
}

/** A staged charge that has not been turned into a bill yet. */
export interface UnitDraftItem {
  id: string;
  unit_id: string | null;
  period: string;
  label: string;
  amount: number;
  due_date: string | null;
  /** Which draft source this came from — drives the icon and label. */
  kind: 'other_charges' | 'sinking_fund';
}

export interface UnitSummaryInput {
  id: string;
  unit_no: string;
  floor: string | null;
  owner_name: string | null;
  advance_balance: number;
}

/** Line item + payment detail for one bill, fetched lazily on expand. */
export interface BillDetail {
  lineItems: {
    id: string;
    description: string;
    payer: string;
    gst_applicable: boolean;
    amount: number;
    area_sqft: number | null;
    rate_per_sqft: number | null;
  }[];
  payments: {
    id: string;
    amount: number;
    mode: string;
    paid_at: string;
    reference_no: string | null;
    paid_by_role: string | null;
    status: string;
    reversed_at: string | null;
    receipt_no: string | null;
  }[];
}

// ── Derived view models ───────────────────────────────────────────────────────

export type UnitStatus = 'no_bills' | 'all_paid' | 'partial' | 'overdue';

export interface BillTypeNode {
  bill: UnitBill;
  /** 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' | 'Void' — amount-derived. */
  displayStatus: string;
  outstanding: number;
  daysOverdue: number;
}

export interface PeriodNode {
  period: string;
  bills: BillTypeNode[];
  billed: number;
  collected: number;
  outstanding: number;
  /** 0–100. Guards against divide-by-zero on fully-waived periods. */
  collectionPct: number;
  status: UnitStatus;
  overdueCount: number;
}

export interface UnitNode {
  unit: UnitSummaryInput;
  periods: PeriodNode[];
  drafts: UnitDraftItem[];
  /** Total unpaid across every non-void bill for this unit. */
  outstanding: number;
  /** Portion of `outstanding` that is past its due date. */
  overdue: number;
  /** Number of individual bills that are past their due date. */
  overdueCount: number;
  billed: number;
  collected: number;
  lastPeriod: string | null;
  lastPeriodTypeCount: number;
  status: UnitStatus;
  billCount: number;
}

// ── Tree construction ─────────────────────────────────────────────────────────

const VOID_STATUSES = new Set(['Void', 'Voided', 'Reversed']);

export function isVoid(bill: { status: string }): boolean {
  return VOID_STATUSES.has(bill.status);
}

function daysPastDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

function rollUpStatus(nodes: BillTypeNode[]): UnitStatus {
  const live = nodes.filter((n) => n.displayStatus !== 'Void');
  if (live.length === 0) return 'no_bills';
  if (live.some((n) => n.displayStatus === 'Overdue')) return 'overdue';
  if (live.every((n) => n.displayStatus === 'Paid')) return 'all_paid';
  return 'partial';
}

/**
 * Builds the full unit → period → bill-type tree from the flat server payload.
 *
 * Every unit gets a node even when it has no bills at all — the whole point of
 * the unit-centric view is that the row count equals the unit count, so an
 * association with 30 units always shows 30 rows.
 */
export function buildUnitTree(
  units: UnitSummaryInput[],
  bills: UnitBill[],
  drafts: UnitDraftItem[],
): UnitNode[] {
  const billsByUnit = new Map<string, UnitBill[]>();
  for (const b of bills) {
    const list = billsByUnit.get(b.unit_id);
    if (list) list.push(b);
    else billsByUnit.set(b.unit_id, [b]);
  }

  const draftsByUnit = new Map<string, UnitDraftItem[]>();
  for (const d of drafts) {
    if (!d.unit_id) continue;
    const list = draftsByUnit.get(d.unit_id);
    if (list) list.push(d);
    else draftsByUnit.set(d.unit_id, [d]);
  }

  return units.map((unit) => {
    const unitBills = billsByUnit.get(unit.id) ?? [];

    const byPeriod = new Map<string, UnitBill[]>();
    for (const b of unitBills) {
      const list = byPeriod.get(b.period);
      if (list) list.push(b);
      else byPeriod.set(b.period, [b]);
    }

    const periods: PeriodNode[] = Array.from(byPeriod.entries())
      // Newest period first — admins care about the current cycle.
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([period, periodBills]) => {
        const nodes: BillTypeNode[] = periodBills
          .map((bill) => {
            const voided = isVoid(bill);
            const displayStatus = voided ? 'Void' : displayBillStatus(bill);
            const outstanding = voided ? 0 : billOutstanding(bill);
            return {
              bill,
              displayStatus,
              outstanding,
              daysOverdue:
                displayStatus === 'Overdue' ? daysPastDue(bill.due_date) : 0,
            };
          })
          .sort((a, b) =>
            billTypeLabel(a.bill.bill_type).localeCompare(
              billTypeLabel(b.bill.bill_type),
            ),
          );

        const live = nodes.filter((n) => n.displayStatus !== 'Void');
        const billed = live.reduce((s, n) => s + n.bill.total_amount, 0);
        // Derive collected from outstanding so `billed = collected + outstanding`
        // always holds. Summing the settled amount directly would exceed the
        // billed total on an overpaid bill and push collection past 100%.
        const collected = live.reduce(
          (s, n) => s + (n.bill.total_amount - n.outstanding),
          0,
        );
        const outstanding = live.reduce((s, n) => s + n.outstanding, 0);

        return {
          period,
          bills: nodes,
          billed,
          collected,
          outstanding,
          collectionPct: billed > 0 ? (collected / billed) * 100 : 100,
          status: rollUpStatus(nodes),
          overdueCount: live.filter((n) => n.displayStatus === 'Overdue')
            .length,
        };
      });

    const allNodes = periods.flatMap((p) => p.bills);
    const live = allNodes.filter((n) => n.displayStatus !== 'Void');

    return {
      unit,
      periods,
      drafts: draftsByUnit.get(unit.id) ?? [],
      outstanding: live.reduce((s, n) => s + n.outstanding, 0),
      overdue: live
        .filter((n) => n.displayStatus === 'Overdue')
        .reduce((s, n) => s + n.outstanding, 0),
      overdueCount: live.filter((n) => n.displayStatus === 'Overdue').length,
      billed: live.reduce((s, n) => s + n.bill.total_amount, 0),
      collected: live.reduce(
        (s, n) => s + (n.bill.total_amount - n.outstanding),
        0,
      ),
      lastPeriod: periods[0]?.period ?? null,
      lastPeriodTypeCount: periods[0]?.bills.length ?? 0,
      status: rollUpStatus(allNodes),
      billCount: live.length,
    };
  });
}

// ── Status presentation ───────────────────────────────────────────────────────

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  no_bills: 'No Bills',
  all_paid: 'All Paid',
  partial: 'Partial',
  overdue: 'Overdue',
};

/**
 * A colored dot next to the unit number is the primary at-a-glance signal —
 * the badge text is the accessible fallback, not the other way round.
 */
export const UNIT_STATUS_DOT: Record<UnitStatus, string> = {
  no_bills: 'bg-muted-foreground/40',
  all_paid: 'bg-emerald-500',
  partial: 'bg-amber-500',
  overdue: 'bg-red-500',
};
