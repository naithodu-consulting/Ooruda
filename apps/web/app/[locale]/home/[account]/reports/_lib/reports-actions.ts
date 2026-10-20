'use server';

import 'server-only';
import type { ReportPdfData } from '@kit/pdf-templates';
import { billTypeLabel } from '@kit/pdf-templates/bill-type-labels';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { preprocessLogoForPdf } from '~/home/[account]/billing/_lib/server/pdf-generation';
import { getAssociationRole } from '~/lib/rbac';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';

import { buildStatementEntries } from '../../statement/_lib/server/statement.service';
import { LEDGER_ALL_UNITS, type ReportsFilters } from './reports-types';

type ActionResult<T = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: string };

type TabKey =
  | 'collection'
  | 'outstanding'
  | 'payments'
  | 'cash_ledger'
  | 'electricity'
  | 'unit_outstanding'
  | 'payment_modes'
  | 'advances'
  | 'gst_summary'
  | 'ledger_statement'
  | 'occupancy'
  | 'directory'
  | 'other_charges';

async function resolveAssociation(associationId: string) {
  const client = getSupabaseServerClient();
  const role = await getAssociationRole(associationId);
  if (!role || !['assoc_admin', 'billing_operator'].includes(role)) {
    return { client, association: null, profile: null };
  }
  const [{ data: association }, { data: profile }] = await Promise.all([
    client
      .from('associations')
      .select(
        'id, accounts(name, picture_url), address, gstin, logo_url, registration_number, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch',
      )
      .eq('id', associationId)
      .single(),
    client.from('profiles').select('full_name').maybeSingle(),
  ]);
  return { client, association, profile };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Amount settled against a bill: payments plus any advance credit applied to it.
 * A bill cleared entirely from advance has paid_amount = 0 but is fully settled.
 */
function settledAmount(b: {
  paid_amount?: unknown;
  advance_applied?: unknown;
}): number {
  return Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0);
}

/** Amount still genuinely owed on a bill, never negative. */
function outstandingAmount(b: {
  total_amount?: unknown;
  paid_amount?: unknown;
  advance_applied?: unknown;
}): number {
  return Math.max(0, Number(b.total_amount ?? 0) - settledAmount(b));
}

function toCSV(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    // Prefix formula-injection characters so spreadsheet apps don't evaluate them
    const s = /^[=+\-@]/.test(String(v)) ? `'${String(v)}` : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
}

/** Convert YYYY-MM-DD to YYYY-MM period string. Returns null when empty. */
function toPeriod(date: string): string | null {
  return date ? date.slice(0, 7) : null;
}

/** Human-readable period range for PDF header. */
function periodLabel(from: string, to: string): string {
  if (!from && !to) return 'All Time';
  const fmt = (p: string) => {
    const [y, m] = p.slice(0, 7).split('-').map(Number);
    if (!y || !m) return p;
    return new Date(y, m - 1).toLocaleString('en-IN', {
      month: 'short',
      year: 'numeric',
    });
  };
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

/** File slug for download names. */
function fileSlug(from: string, to: string, extra?: string): string {
  const range = from && to ? `${from}_to_${to}` : 'all_time';
  return extra ? `${range}_${extra}` : range;
}

// ── Shared: unit-level collection breakdown ───────────────────────────────────
// Used by both CSV and PDF actions for any bill-type selection (single or multiple).

type CollectionUnitRow = {
  unit_no: string;
  bill_count: number;
  billed: number;
  collected: number;
  outstanding: number;
  status: 'paid' | 'partial' | 'unpaid' | 'overdue';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCollectionUnitBreakdown(
  client: any,
  associationId: string,
  billTypes: string[], // empty = all types
  fromPeriod: string | null,
  toPeriod: string | null,
  unitIds: string[],
  collectedOnly = false,
): Promise<CollectionUnitRow[]> {
  let q = client
    .from('bills')
    .select(
      'unit_id, total_amount, paid_amount, advance_applied, status, due_date, units(unit_no)',
    )
    .eq('association_id', associationId)
    .neq('status', 'Reversed')
    .neq('status', 'Void');
  if (billTypes.length > 0) q = q.in('bill_type', billTypes);
  if (fromPeriod) q = (q as any).gte('period', fromPeriod);
  if (toPeriod) q = (q as any).lte('period', toPeriod);
  if (unitIds.length > 0) q = (q as any).in('unit_id', unitIds);

  const { data, error } = await q;
  if (error || !data) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const unitAgg = new Map<
    string,
    {
      unit_no: string;
      billed: number;
      collected: number;
      bill_count: number;
      has_overdue: boolean;
    }
  >();
  for (const b of data as any[]) {
    const uid = b.unit_id as string;
    const unit_no = (b.units as { unit_no: string } | null)?.unit_no ?? '-';
    const settled = Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0);
    const outstanding = Math.max(0, Number(b.total_amount) - settled);
    const isOverdue = outstanding > 0 && new Date(b.due_date) < today;
    const cur = unitAgg.get(uid) ?? {
      unit_no,
      billed: 0,
      collected: 0,
      bill_count: 0,
      has_overdue: false,
    };
    cur.billed += Number(b.total_amount);
    cur.collected += settled;
    cur.bill_count += 1;
    if (isOverdue) cur.has_overdue = true;
    unitAgg.set(uid, cur);
  }

  return Array.from(unitAgg.entries())
    .map(([, v]) => {
      const outstanding = Math.max(0, v.billed - v.collected);
      let status: CollectionUnitRow['status'] = 'paid';
      if (outstanding > 0) {
        if (v.has_overdue) status = 'overdue';
        else if (v.collected > 0) status = 'partial';
        else status = 'unpaid';
      }
      return {
        unit_no: v.unit_no,
        bill_count: v.bill_count,
        billed: v.billed,
        collected: v.collected,
        outstanding,
        status,
      };
    })
    .filter((r) => !collectedOnly || r.collected > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export async function downloadCsvAction(
  associationId: string,
  from: string,
  to: string,
  tab: TabKey,
  filters: Partial<ReportsFilters> = {},
): Promise<ActionResult<{ csv: string; filename: string }>> {
  const client = getSupabaseServerClient();
  const role = await getAssociationRole(associationId);
  if (!role || !['assoc_admin', 'billing_operator'].includes(role)) {
    return { success: false, error: 'Access denied.' };
  }

  const fromPeriod = toPeriod(from);
  const toPeriod_ = toPeriod(to);
  const slug = fileSlug(from, to);
  const {
    unitIds = [],
    billTypes = [],
    outstandingStatus = 'all',
    paymentMode = '',
  } = filters;

  if (tab === 'collection') {
    const rpcParams: Record<string, unknown> = {
      p_association_id: associationId,
    };
    if (fromPeriod) rpcParams['p_from_period'] = fromPeriod;
    if (toPeriod_) rpcParams['p_to_period'] = toPeriod_;
    if (unitIds.length > 0) rpcParams['p_unit_ids'] = unitIds;
    if (billTypes.length > 0) rpcParams['p_bill_types'] = billTypes;

    // Fetch unit breakdown: one section per type when multi-type selected
    const collectedOnly = filters.collectedOnly ?? false;
    const unitSectionsPromise: Promise<
      { label: string; rows: CollectionUnitRow[] }[]
    > =
      billTypes.length > 1
        ? Promise.all(
            billTypes.map(async (bt) => ({
              label: billTypeLabel(bt),
              rows: await fetchCollectionUnitBreakdown(
                client,
                associationId,
                [bt],
                fromPeriod,
                toPeriod_,
                unitIds,
                collectedOnly,
              ),
            })),
          )
        : fetchCollectionUnitBreakdown(
            client,
            associationId,
            billTypes,
            fromPeriod,
            toPeriod_,
            unitIds,
            collectedOnly,
          ).then((rows) => [
            {
              label:
                billTypes.length === 0
                  ? 'All charge types'
                  : billTypeLabel(billTypes[0]!),
              rows,
            },
          ]);

    const [{ data, error }, unitSections] = await Promise.all([
      (client as any).rpc('get_collection_summary', rpcParams),
      unitSectionsPromise,
    ]);
    if (error) return { success: false, error: (error as any).message };

    const rows: any[] = data ?? [];

    let csv = toCSV(
      [
        'Period',
        'Bill Type',
        'Bill Count',
        'Billed (₹)',
        'Collected (₹)',
        'Outstanding (₹)',
      ],
      rows.map((r: any) => [
        r.period,
        billTypeLabel(r.bill_type),
        r.bill_count,
        r.billed,
        r.collected,
        Number(r.billed) - Number(r.collected),
      ]),
    );

    const STATUS_LABEL: Record<string, string> = {
      paid: 'Paid',
      partial: 'Partial',
      unpaid: 'Unpaid',
      overdue: 'Overdue',
    };
    for (const section of unitSections) {
      if (section.rows.length === 0) continue;
      const sectionHeader = `\n\nUnit Breakdown · ${section.label}\n`;
      const unitCsv = toCSV(
        [
          'Unit',
          'Bills',
          'Billed (₹)',
          'Collected (₹)',
          'Outstanding (₹)',
          'Status',
        ],
        section.rows.map((r) => [
          r.unit_no,
          r.bill_count,
          r.billed.toFixed(2),
          r.collected.toFixed(2),
          r.outstanding.toFixed(2),
          STATUS_LABEL[r.status] ?? r.status,
        ]),
      );
      csv = csv + sectionHeader + unitCsv;
    }

    return { success: true, csv, filename: `collection_${slug}.csv` };
  }

  if (tab === 'outstanding') {
    let q = client
      .from('bills')
      .select(
        'period, bill_no, bill_type, total_amount, paid_amount, advance_applied, status, due_date, unit_id, units(unit_no)',
      )
      .eq('association_id', associationId)
      .neq('status', 'Paid')
      .neq('status', 'Reversed')
      .neq('status', 'Void')
      .order('due_date');

    if (fromPeriod) q = (q as any).gte('period', fromPeriod);
    if (toPeriod_) q = (q as any).lte('period', toPeriod_);
    if (unitIds.length > 0) q = (q as any).in('unit_id', unitIds);
    if (billTypes.length > 0) q = (q as any).in('bill_type', billTypes);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let rows = data ?? [];
    if (outstandingStatus === 'overdue') {
      rows = rows.filter((b: any) => new Date(b.due_date) < today);
    } else if (outstandingStatus === 'partial') {
      rows = rows.filter((b: any) => settledAmount(b) > 0);
    } else if (outstandingStatus === 'unpaid') {
      rows = rows.filter((b: any) => settledAmount(b) === 0);
    }

    const csv = toCSV(
      [
        'Unit',
        'Bill No.',
        'Bill Type',
        'Period',
        'Billed (₹)',
        'Paid (₹)',
        'Advance Applied (₹)',
        'Outstanding (₹)',
        'Status',
        'Due Date',
      ],
      rows.map((b: any) => {
        const unit = b.units as { unit_no: string } | null;
        return [
          unit?.unit_no ?? '-',
          b.bill_no,
          billTypeLabel(b.bill_type),
          b.period,
          b.total_amount,
          b.paid_amount,
          Number(b.advance_applied ?? 0),
          outstandingAmount(b),
          b.status,
          b.due_date,
        ];
      }),
    );
    return { success: true, csv, filename: `outstanding_${slug}.csv` };
  }

  if (tab === 'payments') {
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    // Razorpay payments
    let rpQ = (client as any)
      .from('payments')
      .select(
        'amount, mode, reference_no, paid_at, bills(bill_no, bill_type, unit_id, units(unit_no)), receipts(receipt_no)',
      )
      .eq('association_id', associationId)
      .order('paid_at', { ascending: false });
    if (from && ISO_DATE.test(from)) rpQ = rpQ.gte('paid_at', from);
    if (to && ISO_DATE.test(to)) rpQ = rpQ.lte('paid_at', `${to}T23:59:59.999`);
    if (unitIds.length > 0)
      rpQ = rpQ.filter('bills.unit_id', 'in', `(${unitIds.join(',')})`);
    if (billTypes.length > 0)
      rpQ = rpQ.filter('bills.bill_type', 'in', `(${billTypes.join(',')})`);
    if (paymentMode) rpQ = rpQ.eq('mode', paymentMode);

    // Cash ledger payments (manual entries)
    let clQ = client
      .from('cash_ledger_payments')
      .select(
        'amount, mode, reference_no, paid_at, unit_id, bill_type, receipt_no, units(unit_no)',
      )
      .eq('association_id', associationId)
      .eq('status', 'active')
      .order('paid_at', { ascending: false });
    if (from && ISO_DATE.test(from)) clQ = (clQ as any).gte('paid_at', from);
    if (to && ISO_DATE.test(to))
      clQ = (clQ as any).lte('paid_at', `${to}T23:59:59.999`);
    if (unitIds.length > 0) clQ = (clQ as any).in('unit_id', unitIds);
    if (billTypes.length > 0) clQ = (clQ as any).in('bill_type', billTypes);
    if (paymentMode) clQ = (clQ as any).eq('mode', paymentMode);

    const [rpRes, clRes] = await Promise.all([rpQ, clQ]);
    if (rpRes.error)
      return { success: false, error: (rpRes.error as any).message };
    if (clRes.error) return { success: false, error: clRes.error.message };

    const rpRows = ((rpRes.data as any[]) ?? []).map((p: any) => {
      const bill = p.bills as {
        bill_no: string;
        bill_type: string;
        units: { unit_no: string } | null;
      } | null;
      const receipt = Array.isArray(p.receipts) ? p.receipts[0] : p.receipts;
      return [
        p.paid_at?.slice(0, 10) ?? '',
        bill?.units?.unit_no ?? '-',
        bill?.bill_no ?? '-',
        billTypeLabel(bill?.bill_type),
        p.amount,
        p.mode,
        p.reference_no ?? '',
        (receipt as { receipt_no: string } | null)?.receipt_no ?? '',
        'Razorpay',
      ];
    });

    const clRows = ((clRes.data as any[]) ?? []).map((p: any) => {
      const unit = p.units as { unit_no: string } | null;
      return [
        p.paid_at?.slice(0, 10) ?? '',
        unit?.unit_no ?? '-',
        '-',
        billTypeLabel(p.bill_type),
        p.amount,
        p.mode,
        p.reference_no ?? '',
        p.receipt_no ?? '',
        'Cash Ledger',
      ];
    });

    // Merge and sort by date desc
    const allRows = [...rpRows, ...clRows].sort((a, b) =>
      String(b[0]).localeCompare(String(a[0])),
    );

    const csv = toCSV(
      [
        'Date',
        'Unit',
        'Bill No.',
        'Bill Type',
        'Amount (₹)',
        'Mode',
        'Reference',
        'Receipt No.',
        'Source',
      ],
      allRows,
    );
    return { success: true, csv, filename: `payments_${slug}.csv` };
  }

  if (tab === 'cash_ledger') {
    let q = client
      .from('cash_ledger')
      .select(
        'entry_date, entry_type, bill_type, direction, amount, notes, paid_by_name, unit_id, units(unit_no)',
      )
      .eq('association_id', associationId)
      .order('entry_date', { ascending: false });

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (from && ISO_DATE.test(from)) q = (q as any).gte('entry_date', from);
    if (to && ISO_DATE.test(to)) q = (q as any).lte('entry_date', to);
    if (unitIds.length > 0) q = (q as any).in('unit_id', unitIds);
    if (billTypes.length > 0) q = (q as any).in('bill_type', billTypes);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const csv = toCSV(
      [
        'Date',
        'Unit',
        'Entry Type',
        'Bill Type',
        'Direction',
        'Amount (₹)',
        'Paid By',
        'Notes',
      ],
      (data ?? []).map((r: any) => {
        const unit = r.units as { unit_no: string } | null;
        return [
          r.entry_date,
          unit?.unit_no ?? '-',
          r.entry_type,
          billTypeLabel(r.bill_type),
          r.direction,
          r.amount,
          r.paid_by_name,
          r.notes ?? '',
        ];
      }),
    );
    return { success: true, csv, filename: `cash_ledger_${slug}.csv` };
  }

  if (tab === 'electricity') {
    let q = client
      .from('mescom_bills')
      .select('period, invoice_amount, block_consumption_units')
      .eq('association_id', associationId)
      .order('period', { ascending: false });
    if (fromPeriod) q = (q as any).gte('period', fromPeriod);
    if (toPeriod_) q = (q as any).lte('period', toPeriod_);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const csv = toCSV(
      ['Period', 'Invoice Amount (₹)', 'Block Units (kWh)', 'Rate / kWh (₹)'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((r: any) => [
        r.period,
        r.invoice_amount,
        r.block_consumption_units,
        r.block_consumption_units > 0
          ? (
              Number(r.invoice_amount) / Number(r.block_consumption_units)
            ).toFixed(4)
          : '',
      ]),
    );
    return { success: true, csv, filename: `electricity_${slug}.csv` };
  }

  if (tab === 'unit_outstanding') {
    const { data, error } = await client
      .from('bills')
      .select(
        'unit_id, total_amount, paid_amount, advance_applied, status, due_date, units(unit_no)',
      )
      .eq('association_id', associationId)
      .neq('status', 'Reversed')
      .neq('status', 'Void');
    if (error) return { success: false, error: error.message };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const unitMap = new Map<
      string,
      { unit_no: string; outstanding: number; overdue: number }
    >();
    for (const b of data ?? []) {
      const uid = b.unit_id as string;
      const unit_no = (b.units as { unit_no: string } | null)?.unit_no ?? '-';
      const out = Math.max(
        0,
        Number(b.total_amount) -
          Number(b.paid_amount ?? 0) -
          Number(b.advance_applied ?? 0),
      );
      const isOverdue = out > 0 && new Date(b.due_date) < today;
      const cur = unitMap.get(uid) ?? { unit_no, outstanding: 0, overdue: 0 };
      cur.outstanding += out;
      if (isOverdue) cur.overdue += 1;
      unitMap.set(uid, cur);
    }
    const rows = Array.from(unitMap.entries())
      .filter(([, v]) => v.outstanding > 0)
      .sort((a, b) => b[1].outstanding - a[1].outstanding);
    const csv = toCSV(
      ['Unit', 'Outstanding (₹)', 'Overdue Bills', 'Status'],
      rows.map(([, v]) => [
        v.unit_no,
        v.outstanding.toFixed(2),
        v.overdue,
        v.overdue > 0 ? 'Overdue' : 'Pending',
      ]),
    );
    return { success: true, csv, filename: `unit_outstanding_${slug}.csv` };
  }

  if (tab === 'payment_modes') {
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    let rpQ = (client as any)
      .from('payments')
      .select('amount, mode')
      .eq('association_id', associationId);
    if (from && ISO_DATE.test(from)) rpQ = rpQ.gte('paid_at', from);
    if (to && ISO_DATE.test(to)) rpQ = rpQ.lte('paid_at', `${to}T23:59:59.999`);

    let clQ = client
      .from('cash_ledger_payments')
      .select('amount, mode')
      .eq('association_id', associationId)
      .eq('status', 'active');
    if (from && ISO_DATE.test(from)) clQ = (clQ as any).gte('paid_at', from);
    if (to && ISO_DATE.test(to))
      clQ = (clQ as any).lte('paid_at', `${to}T23:59:59.999`);

    const [rpRes, clRes] = await Promise.all([rpQ, clQ]);
    if (rpRes.error) return { success: false, error: rpRes.error.message };
    if (clRes.error) return { success: false, error: clRes.error.message };

    const modeMap = new Map<string, { amount: number; count: number }>();
    for (const p of [...(rpRes.data ?? []), ...(clRes.data ?? [])] as any[]) {
      const mode = p.mode ?? 'Unknown';
      const cur = modeMap.get(mode) ?? { amount: 0, count: 0 };
      cur.amount += Number(p.amount);
      cur.count += 1;
      modeMap.set(mode, cur);
    }
    const total = Array.from(modeMap.values()).reduce(
      (s, v) => s + v.amount,
      0,
    );
    const rows2 = Array.from(modeMap.entries()).sort(
      (a, b) => b[1].amount - a[1].amount,
    );
    const csv = toCSV(
      ['Mode', 'Transactions', 'Amount (₹)', 'Share (%)'],
      rows2.map(([mode, v]) => [
        mode,
        v.count,
        v.amount.toFixed(2),
        total > 0 ? ((v.amount / total) * 100).toFixed(1) : '0.0',
      ]),
    );
    return { success: true, csv, filename: `payment_modes_${slug}.csv` };
  }

  if (tab === 'advances') {
    const [balRes, unitsRes] = await Promise.all([
      (client as any).rpc('get_association_cash_ledger_balances', {
        p_association_id: associationId,
      }),
      client
        .from('units')
        .select('id, unit_no')
        .eq('association_id', associationId),
    ]);
    if (balRes.error) return { success: false, error: balRes.error.message };

    const unitNoMap = new Map<string, string>(
      ((unitsRes.data ?? []) as any[]).map((u: any) => [u.id, u.unit_no]),
    );
    const balanceMap = new Map<string, number>();
    for (const r of (balRes.data ?? []) as any[]) {
      balanceMap.set(
        r.unit_id,
        (balanceMap.get(r.unit_id) ?? 0) + Number(r.balance),
      );
    }
    const rows3 = Array.from(balanceMap.entries())
      .filter(([, b]) => b > 0)
      .sort((a, b) => b[1] - a[1]);
    const csv = toCSV(
      ['Unit', 'Advance Balance (₹)'],
      rows3.map(([uid, bal]) => [unitNoMap.get(uid) ?? uid, bal.toFixed(2)]),
    );
    return { success: true, csv, filename: `advances_${slug}.csv` };
  }

  if (tab === 'gst_summary') {
    let q = client
      .from('bills')
      .select(
        'period, bill_type, total_amount, paid_amount, advance_applied, gst_amount',
      )
      .eq('association_id', associationId)
      .neq('status', 'Reversed')
      .neq('status', 'Void')
      .not('gst_amount', 'is', null)
      .gt('gst_amount', 0)
      .order('period', { ascending: false });

    if (from) q = (q as any).gte('period', from.slice(0, 7));
    if (to) q = (q as any).lte('period', to.slice(0, 7));
    if (billTypes.length > 0) q = (q as any).in('bill_type', billTypes);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const agg = new Map<
      string,
      {
        bill_type: string;
        period: string;
        bill_count: number;
        taxable: number;
        gst: number;
        total: number;
        collected: number;
      }
    >();
    for (const b of data ?? []) {
      const key = `${b.period}|${b.bill_type}`;
      const settled =
        Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0);
      const cur = agg.get(key) ?? {
        bill_type: b.bill_type,
        period: b.period,
        bill_count: 0,
        taxable: 0,
        gst: 0,
        total: 0,
        collected: 0,
      };
      cur.bill_count += 1;
      cur.gst += Number(b.gst_amount);
      cur.total += Number(b.total_amount);
      cur.taxable += Number(b.total_amount) - Number(b.gst_amount);
      cur.collected += Math.min(settled, Number(b.total_amount));
      agg.set(key, cur);
    }

    const csv = toCSV(
      [
        'Period',
        'Charge Type',
        'Bills',
        'Taxable (₹)',
        'GST Billed (₹)',
        'Total Billed (₹)',
        'GST Collected (₹)',
        'Pending GST (₹)',
      ],
      Array.from(agg.values()).map((v) => {
        const gstRatio = v.total > 0 ? v.gst / v.total : 0;
        const collectedGst = v.collected * gstRatio;
        const pendingGst = Math.max(0, v.gst - collectedGst);
        return [
          v.period,
          billTypeLabel(v.bill_type),
          v.bill_count,
          v.taxable.toFixed(2),
          v.gst.toFixed(2),
          v.total.toFixed(2),
          collectedGst.toFixed(2),
          pendingGst.toFixed(2),
        ];
      }),
    );
    return { success: true, csv, filename: `gst_summary_${slug}.csv` };
  }

  if (tab === 'occupancy' || tab === 'directory') {
    return downloadOccupancyOrDirectoryCsvAction(associationId, tab);
  }

  if (tab === 'other_charges') {
    let q = client
      .from('bills')
      .select(
        'id, total_amount, paid_amount, advance_applied, bill_line_items(description, amount)',
      )
      .eq('association_id', associationId)
      .eq('bill_type', 'other_charges')
      .neq('status', 'Reversed')
      .neq('status', 'Void');
    if (from) q = (q as any).gte('period', from.slice(0, 7));
    if (to) q = (q as any).lte('period', to.slice(0, 7));
    if (unitIds.length > 0) q = (q as any).in('unit_id', unitIds);
    const { data: ocData, error: ocError } = await q;
    if (ocError) return { success: false, error: ocError.message };

    const chargeMap = new Map<
      string,
      { billed: number; collected: number; bill_count: number }
    >();
    for (const b of (ocData ?? []) as any[]) {
      const billTotal = Number(b.total_amount ?? 0);
      const settled = Math.min(
        Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0),
        billTotal,
      );
      const items: { description: string; amount: number }[] =
        (b.bill_line_items as any[]) ?? [];
      for (const item of items) {
        const desc = (item.description as string) || 'Other';
        const itemAmt = Number(item.amount ?? 0);
        const fraction = billTotal > 0 ? itemAmt / billTotal : 0;
        const itemCollected = Math.round(settled * fraction * 100) / 100;
        const cur = chargeMap.get(desc) ?? {
          billed: 0,
          collected: 0,
          bill_count: 0,
        };
        cur.billed += itemAmt;
        cur.collected += itemCollected;
        cur.bill_count += 1;
        chargeMap.set(desc, cur);
      }
    }
    const rows = Array.from(chargeMap.entries())
      .map(([charge_name, v]) => [
        charge_name,
        v.bill_count,
        v.billed.toFixed(2),
        v.collected.toFixed(2),
        Math.max(0, v.billed - v.collected).toFixed(2),
        v.billed > 0 ? `${Math.round((v.collected / v.billed) * 100)}%` : '0%',
      ])
      .sort((a, b) => Number(b[2]) - Number(a[2]));
    const csv = toCSV(
      [
        'Charge Name',
        'Bills',
        'Billed (₹)',
        'Collected (₹)',
        'Outstanding (₹)',
        'Collection Rate',
      ],
      rows,
    );
    return { success: true, csv, filename: `other_charges_${slug}.csv` };
  }

  return { success: false, error: 'Unknown tab.' };
}

// ── PDF Export ────────────────────────────────────────────────────────────────

export async function downloadPdfAction(
  associationId: string,
  from: string,
  to: string,
  tab: TabKey | 'all',
  filters: Partial<ReportsFilters> = {},
): Promise<ActionResult<{ base64: string; filename: string }>> {
  // Start loading/warming the renderer; it overlaps the report queries.
  const rendererPromise = loadPdfRenderer();
  rendererPromise.catch(() => undefined);

  const {
    client,
    association,
    profile: resolvedProfile,
  } = await resolveAssociation(associationId);
  if (!association) return { success: false, error: 'Access denied.' };

  const fromPeriod = toPeriod(from);
  const toPeriod_ = toPeriod(to);
  const { unitIds = [], billTypes = [] } = filters;

  // Determine which sections to include based on the active tab
  const sectionMap: Record<
    string,
    ('collection' | 'outstanding' | 'payments' | 'electricity')[]
  > = {
    collection: ['collection'],
    outstanding: ['outstanding'],
    payments: ['payments'],
    cash_ledger: [],
    electricity: ['electricity'],
    unit_outstanding: ['outstanding'],
    payment_modes: ['payments'],
    advances: ['payments'],
    gst_summary: [],
    // Ledger statement is per-unit and exported as CSV from within the tab -
    // it has no financial-section PDF representation.
    ledger_statement: [],
    occupancy: [],
    directory: [],
    other_charges: [],
    all: ['collection', 'outstanding', 'payments', 'electricity'],
  };
  const activeSections = sectionMap[tab] ?? [
    'collection',
    'outstanding',
    'payments',
    'electricity',
  ];

  const rpcParams: Record<string, unknown> = {
    p_association_id: associationId,
  };
  if (fromPeriod) rpcParams['p_from_period'] = fromPeriod;
  if (toPeriod_) rpcParams['p_to_period'] = toPeriod_;
  if (unitIds.length > 0) rpcParams['p_unit_ids'] = unitIds;
  if (billTypes.length > 0) rpcParams['p_bill_types'] = billTypes;

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  // Only fetch data for sections we will render
  const collectionPromise = activeSections.includes('collection')
    ? (client as any).rpc('get_collection_summary', rpcParams)
    : Promise.resolve({ data: [], error: null });

  let billsQ = client
    .from('bills')
    .select(
      'bill_no, bill_type, total_amount, paid_amount, advance_applied, status, due_date, period, unit_id, units(unit_no)',
    )
    .eq('association_id', associationId)
    .neq('status', 'Paid')
    .neq('status', 'Reversed')
    .neq('status', 'Void')
    .order('due_date')
    .limit(200);
  if (fromPeriod) billsQ = (billsQ as any).gte('period', fromPeriod);
  if (toPeriod_) billsQ = (billsQ as any).lte('period', toPeriod_);
  if (unitIds.length > 0) billsQ = (billsQ as any).in('unit_id', unitIds);
  if (billTypes.length > 0) billsQ = (billsQ as any).in('bill_type', billTypes);
  const outstandingPromise = activeSections.includes('outstanding')
    ? billsQ
    : Promise.resolve({ data: [], error: null });

  let paymentsQ = (client as any)
    .from('payments')
    .select('amount, mode, paid_at, bills(bill_no, unit_id, units(unit_no))')
    .eq('association_id', associationId)
    .order('paid_at', { ascending: false })
    .limit(100);
  if (from && ISO_DATE.test(from)) paymentsQ = paymentsQ.gte('paid_at', from);
  if (to && ISO_DATE.test(to))
    paymentsQ = paymentsQ.lte('paid_at', `${to}T23:59:59.999`);
  if (unitIds.length > 0)
    paymentsQ = paymentsQ.filter(
      'bills.unit_id',
      'in',
      `(${unitIds.join(',')})`,
    );
  const paymentsPromise = activeSections.includes('payments')
    ? paymentsQ
    : Promise.resolve({ data: [], error: null });

  let elecQ = client
    .from('mescom_bills')
    .select(
      'id, period, invoice_amount, block_consumption_units, effective_rate',
    )
    .eq('association_id', associationId)
    .order('period', { ascending: false });
  if (fromPeriod) elecQ = (elecQ as any).gte('period', fromPeriod);
  if (toPeriod_) elecQ = (elecQ as any).lte('period', toPeriod_);

  const electricityPromise = activeSections.includes('electricity')
    ? elecQ
    : Promise.resolve({ data: [], error: null });

  // Fetch unit numbers for the selected unit IDs so the PDF can disclose them
  const unitNosPromise =
    unitIds.length > 0
      ? client.from('units').select('unit_no').in('id', unitIds)
      : Promise.resolve({ data: [] as { unit_no: string }[], error: null });

  const [
    collectionRes,
    outstandingRes,
    paymentsRes,
    electricityRes,
    unitNosRes,
  ] = await Promise.all([
    collectionPromise,
    outstandingPromise,
    paymentsPromise,
    electricityPromise,
    unitNosPromise,
  ]);
  const profileRes = { data: resolvedProfile };

  if (collectionRes.error) {
    return {
      success: false,
      error: `Collection summary failed: ${(collectionRes.error as any).message ?? 'unknown error'}`,
    };
  }

  const collectionRows: any[] = (collectionRes.data as any[]) ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outstandingBills: any[] = outstandingRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentRows: any[] = paymentsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mescomRows: any[] = electricityRes.data ?? [];

  const byPeriod = new Map<
    string,
    { billed: number; collected: number; bill_count: number }
  >();
  for (const r of collectionRows) {
    const cur = byPeriod.get(r.period) ?? {
      billed: 0,
      collected: 0,
      bill_count: 0,
    };
    cur.billed += Number(r.billed);
    cur.collected += Number(r.collected);
    cur.bill_count += Number(r.bill_count);
    byPeriod.set(r.period, cur);
  }

  const byMode = new Map<string, number>();
  for (const p of paymentRows)
    byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + Number(p.amount));

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const assocAccounts = association.accounts as {
    name?: string | null;
    picture_url?: string | null;
  } | null;
  const assocName = assocAccounts?.name ?? 'Association';

  // Preprocess logo to a base64 data URI - react-pdf cannot pass auth headers
  // when fetching raw Supabase Storage URLs, causing silent fallback to the
  // OorudaMark placeholder. Use logo_url first, fall back to accounts.picture_url.
  const rawLogoUrl =
    (association.logo_url as string | null) ??
    assocAccounts?.picture_url ??
    null;
  const logoDataUri = await preprocessLogoForPdf(rawLogoUrl);

  const data: ReportPdfData = {
    association: {
      name: assocName,
      address: association.address ?? null,
      gstin: association.gstin ?? null,
      registrationNumber: association.registration_number ?? null,
      logoUrl: logoDataUri,
      email: association.email ?? null,
      phone: association.phone ?? null,
      bankAccountName: association.bank_account_name ?? null,
      bankAccountNumber: association.bank_account_number ?? null,
      bankName: association.bank_name ?? null,
      bankIfsc: association.bank_ifsc ?? null,
      bankBranch: association.bank_branch ?? null,
    },
    periodLabel: periodLabel(from, to),
    generatedAt: today,
    generatedBy: profileRes.data?.full_name ?? 'Admin',
    collection: {
      totalBilled: collectionRows.reduce((s, r) => s + Number(r.billed), 0),
      totalCollected: collectionRows.reduce(
        (s, r) => s + Number(r.collected),
        0,
      ),
      billCount: collectionRows.reduce((s, r) => s + Number(r.bill_count), 0),
      byPeriod: Array.from(byPeriod.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([period, v]) => ({ period, ...v })),
    },
    outstanding: {
      totalOutstanding: outstandingBills.reduce(
        (s, b) => s + outstandingAmount(b),
        0,
      ),
      overdueCount: outstandingBills.filter((b) => {
        const due = new Date(b.due_date);
        return due < new Date() && b.status !== 'Paid';
      }).length,
      topBills: outstandingBills
        .filter((b) => outstandingAmount(b) > 0)
        .map((b) => ({
          unit_no: (b.units as { unit_no: string } | null)?.unit_no ?? '-',
          bill_no: b.bill_no,
          bill_type: b.bill_type ?? 'maintenance',
          period: b.period,
          outstanding: outstandingAmount(b),
          due_date: b.due_date,
        })),
    },
    payments: {
      total: paymentRows.reduce((s: number, p: any) => s + Number(p.amount), 0),
      count: paymentRows.length,
      byMode: Array.from(byMode.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([mode, amount]) => ({ mode, amount })),
      recentPayments: paymentRows.map((p: any) => {
        const bill = p.bills as {
          bill_no: string;
          units: { unit_no: string } | null;
        } | null;
        return {
          paid_at: p.paid_at?.slice(0, 10) ?? '',
          unit_no: bill?.units?.unit_no ?? '-',
          bill_no: bill?.bill_no ?? '-',
          amount: Number(p.amount),
          mode: p.mode,
        };
      }),
    },
    electricity: {
      totalCost: mescomRows.reduce((s, r) => s + Number(r.invoice_amount), 0),
      totalUnits: mescomRows.reduce(
        (s, r) => s + Number(r.block_consumption_units),
        0,
      ),
      byPeriod: mescomRows.map((r) => ({
        period: r.period,
        invoice_amount: Number(r.invoice_amount),
        block_units: Number(r.block_consumption_units),
        rate:
          r.block_consumption_units > 0
            ? Number(r.invoice_amount) / Number(r.block_consumption_units)
            : null,
      })),
      byUnit:
        tab !== 'electricity'
          ? undefined
          : await (async () => {
              if (
                !activeSections.includes('electricity') ||
                mescomRows.length === 0
              )
                return undefined;
              const mescomIds = mescomRows.map((m: any) => m.id);
              const periods = mescomRows.map((m: any) => m.period);
              const [mrRes, elecBillsRes] = await Promise.all([
                client
                  .from('meter_readings')
                  .select(
                    'period, previous_reading, current_reading, consumed_units, minimum_charge, sub_meters!inner(meter_type, unit_id, units!inner(unit_no))',
                  )
                  .in('mescom_bill_id', mescomIds),
                client
                  .from('bills')
                  .select('period, unit_id, total_amount')
                  .eq('association_id', associationId)
                  .eq('bill_type', 'electricity')
                  .neq('status', 'Void')
                  .in('period', periods),
              ]);
              if (mrRes.error || elecBillsRes.error) return undefined;
              const chargeMap = new Map<string, number>();
              for (const b of (elecBillsRes.data ?? []) as any[])
                chargeMap.set(
                  `${b.unit_id}:${b.period}`,
                  Number(b.total_amount),
                );
              // Rate per unit per period from the mescom bill
              const rateMap = new Map<string, number>();
              for (const m of mescomRows as any[]) {
                if (m.effective_rate)
                  rateMap.set(m.period, Number(m.effective_rate));
                else if (m.block_consumption_units > 0)
                  rateMap.set(
                    m.period,
                    Number(m.invoice_amount) /
                      Number(m.block_consumption_units),
                  );
              }
              const rows: {
                period: string;
                unit_no: string;
                prev_reading: number;
                curr_reading: number;
                consumed_units: number;
                minimum_charge: number;
                rate_per_unit: number | null;
                charged_amount: number;
              }[] = [];
              for (const r of (mrRes.data ?? []) as any[]) {
                const sm = r.sub_meters as {
                  meter_type: string;
                  unit_id: string;
                  units: { unit_no: string } | null;
                } | null;
                if (!sm || sm.meter_type !== 'Unit' || !sm.units) continue;
                const consumed = Number(r.consumed_units);
                const minCharge = Number(r.minimum_charge ?? 0);
                if (consumed <= 0 && minCharge <= 0) continue;
                rows.push({
                  period: r.period,
                  unit_no: sm.units.unit_no,
                  prev_reading: Number(r.previous_reading ?? 0),
                  curr_reading: Number(r.current_reading ?? 0),
                  consumed_units: consumed,
                  minimum_charge: minCharge,
                  rate_per_unit: rateMap.get(r.period) ?? null,
                  charged_amount:
                    chargeMap.get(`${sm.unit_id}:${r.period}`) ?? 0,
                });
              }
              return rows.sort(
                (a, b) =>
                  b.period.localeCompare(a.period) ||
                  a.unit_no.localeCompare(b.unit_no),
              );
            })(),
    },
    collectionUnitBreakdown:
      tab === 'collection'
        ? await (async () => {
            // When multiple types are selected, produce a separate section per type
            // so the reader can distinguish Maintenance vs Electricity rows.
            const effectiveTypes = billTypes.length > 1 ? billTypes : billTypes; // always use passed array
            const collectedOnly = filters.collectedOnly ?? false;

            if (billTypes.length > 1) {
              // Parallel fetch: one section per bill type
              const sections = await Promise.all(
                billTypes.map(async (bt) => {
                  const rows = await fetchCollectionUnitBreakdown(
                    client,
                    associationId,
                    [bt],
                    fromPeriod,
                    toPeriod_,
                    unitIds,
                    collectedOnly,
                  );
                  return { billTypeLabel: billTypeLabel(bt), rows };
                }),
              );
              const nonEmpty = sections.filter((s) => s.rows.length > 0);
              return nonEmpty.length > 0 ? nonEmpty : undefined;
            }

            // 0 or 1 bill type - single combined section
            const rows = await fetchCollectionUnitBreakdown(
              client,
              associationId,
              effectiveTypes,
              fromPeriod,
              toPeriod_,
              unitIds,
              collectedOnly,
            );
            if (rows.length === 0) return undefined;
            const label =
              billTypes.length === 0
                ? 'All charge types'
                : billTypeLabel(billTypes[0]!);
            return [{ billTypeLabel: label, rows }];
          })()
        : undefined,
    activeSections,
    cashLedger: await (async () => {
      if (tab !== 'cash_ledger') return undefined;
      const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
      let clQ = client
        .from('cash_ledger')
        .select(
          'entry_date, entry_type, bill_type, direction, amount, notes, paid_by_name, unit_id, units(unit_no)',
        )
        .eq('association_id', associationId)
        .order('entry_date', { ascending: false });
      if (from && ISO_DATE.test(from))
        clQ = (clQ as any).gte('entry_date', from);
      if (to && ISO_DATE.test(to)) clQ = (clQ as any).lte('entry_date', to);
      if (unitIds.length > 0) clQ = (clQ as any).in('unit_id', unitIds);
      if (billTypes.length > 0) clQ = (clQ as any).in('bill_type', billTypes);
      const { data: clData, error: clError } = await clQ;
      if (clError) return undefined;
      const entries: {
        entry_date: string;
        unit_no: string;
        entry_type: string;
        bill_type: string;
        direction: 'credit' | 'debit';
        amount: number;
        paid_by_name: string;
        notes: string;
      }[] = (clData ?? []).map((r: any) => ({
        entry_date: r.entry_date,
        unit_no: (r.units as { unit_no: string } | null)?.unit_no ?? '-',
        entry_type: r.entry_type as string,
        bill_type: r.bill_type as string,
        direction: r.direction as 'credit' | 'debit',
        amount: Number(r.amount),
        paid_by_name: r.paid_by_name ?? '',
        notes: r.notes ?? '',
      }));
      const totalCredits = entries
        .filter((e) => e.direction === 'credit')
        .reduce((s, e) => s + e.amount, 0);
      const totalDebits = entries
        .filter((e) => e.direction === 'debit')
        .reduce((s, e) => s + e.amount, 0);
      return { totalCredits, totalDebits, entries };
    })(),
    appliedFilters: {
      unitNos:
        (unitNosRes.data ?? []).length > 0
          ? (unitNosRes.data ?? []).map((u: { unit_no: string }) => u.unit_no)
          : undefined,
      billTypes:
        billTypes.length > 0
          ? billTypes.map((bt) => billTypeLabel(bt))
          : undefined,
      collectedOnly: filters.collectedOnly ?? false,
    },
    occupancy: await (async () => {
      if (tab !== 'occupancy') return undefined;
      const res = await fetchOccupancyAction(associationId);
      if (!res.success) return undefined;
      return { rows: res.rows };
    })(),
    directory: await (async () => {
      if (tab !== 'directory') return undefined;
      const res = await fetchDirectoryAction(associationId);
      if (!res.success) return undefined;
      return { rows: res.rows };
    })(),
    otherCharges: await (async () => {
      if (tab !== 'other_charges') return undefined;
      let q = client
        .from('bills')
        .select(
          'id, unit_id, total_amount, paid_amount, advance_applied, units(unit_no), bill_line_items(description, amount)',
        )
        .eq('association_id', associationId)
        .eq('bill_type', 'other_charges')
        .neq('status', 'Reversed')
        .neq('status', 'Void');
      if (fromPeriod) q = (q as any).gte('period', fromPeriod);
      if (toPeriod_) q = (q as any).lte('period', toPeriod_);
      if (unitIds.length > 0) q = (q as any).in('unit_id', unitIds);
      const { data: ocData } = await q;

      // charge-level aggregation
      const chargeMap = new Map<
        string,
        { billed: number; collected: number; bill_count: number }
      >();
      // unit-level aggregation: key = `${charge_name}|||${unit_no}`
      const unitMap = new Map<
        string,
        {
          charge_name: string;
          unit_no: string;
          billed: number;
          collected: number;
        }
      >();

      for (const b of (ocData ?? []) as any[]) {
        const billTotal = Number(b.total_amount ?? 0);
        const settled = Math.min(
          Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0),
          billTotal,
        );
        const unit_no = (b.units as { unit_no: string } | null)?.unit_no ?? '-';
        const items: { description: string; amount: number }[] =
          (b.bill_line_items as any[]) ?? [];
        for (const item of items) {
          const desc = (item.description as string) || 'Other';
          const itemAmt = Number(item.amount ?? 0);
          const fraction = billTotal > 0 ? itemAmt / billTotal : 0;
          const itemCollected = Math.round(settled * fraction * 100) / 100;

          const cur = chargeMap.get(desc) ?? {
            billed: 0,
            collected: 0,
            bill_count: 0,
          };
          cur.billed += itemAmt;
          cur.collected += itemCollected;
          cur.bill_count += 1;
          chargeMap.set(desc, cur);

          const uKey = `${desc}|||${unit_no}`;
          const ucur = unitMap.get(uKey) ?? {
            charge_name: desc,
            unit_no,
            billed: 0,
            collected: 0,
          };
          ucur.billed += itemAmt;
          ucur.collected += itemCollected;
          unitMap.set(uKey, ucur);
        }
      }

      const rows = Array.from(chargeMap.entries())
        .map(([charge_name, v]) => ({
          charge_name,
          bill_count: v.bill_count,
          billed: v.billed,
          collected: v.collected,
          outstanding: Math.max(0, v.billed - v.collected),
        }))
        .sort((a, b) => b.billed - a.billed);

      const unitRows = Array.from(unitMap.values())
        .map((v) => ({
          ...v,
          outstanding: Math.max(0, v.billed - v.collected),
        }))
        .sort(
          (a, b) =>
            a.charge_name.localeCompare(b.charge_name) ||
            a.unit_no.localeCompare(b.unit_no),
        );

      return { rows, unitRows };
    })(),
    gstSummary: await (async () => {
      if (tab !== 'gst_summary') return undefined;
      let q = client
        .from('bills')
        .select(
          'period, bill_type, total_amount, paid_amount, advance_applied, gst_amount',
        )
        .eq('association_id', associationId)
        .neq('status', 'Reversed')
        .neq('status', 'Void')
        .not('gst_amount', 'is', null)
        .gt('gst_amount', 0);
      if (from) q = (q as any).gte('period', from.slice(0, 7));
      if (to) q = (q as any).lte('period', to.slice(0, 7));
      if (billTypes.length > 0) q = (q as any).in('bill_type', billTypes);
      const { data: gstData, error: gstError } = await q;
      if (gstError) return undefined;
      const agg = new Map<
        string,
        {
          period: string;
          bill_type: string;
          bill_count: number;
          taxable_amount: number;
          gst_amount: number;
          total_amount: number;
          collected_total: number;
          collected_gst: number;
        }
      >();
      for (const b of (gstData ?? []) as any[]) {
        const key = `${b.period}|${b.bill_type}`;
        const settled =
          Number(b.paid_amount ?? 0) + Number(b.advance_applied ?? 0);
        const cur = agg.get(key) ?? {
          period: b.period,
          bill_type: b.bill_type,
          bill_count: 0,
          taxable_amount: 0,
          gst_amount: 0,
          total_amount: 0,
          collected_total: 0,
          collected_gst: 0,
        };
        cur.bill_count += 1;
        cur.gst_amount += Number(b.gst_amount);
        cur.total_amount += Number(b.total_amount);
        cur.taxable_amount += Number(b.total_amount) - Number(b.gst_amount);
        cur.collected_total += Math.min(settled, Number(b.total_amount));
        agg.set(key, cur);
      }
      const rows = Array.from(agg.values()).sort(
        (a, b) =>
          b.period.localeCompare(a.period) ||
          a.bill_type.localeCompare(b.bill_type),
      );
      return { rows };
    })(),
  };

  try {
    const { renderReportPdf } = await rendererPromise;
    const buffer = await renderReportPdf(data);
    const base64 = buffer.toString('base64');
    return {
      success: true,
      base64,
      filename:
        tab === 'cash_ledger'
          ? `cash_ledger_${fileSlug(from, to)}.pdf`
          : tab === 'gst_summary'
            ? `gst_summary_${fileSlug(from, to)}.pdf`
            : tab === 'other_charges'
              ? `other_charges_${fileSlug(from, to)}.pdf`
              : tab === 'occupancy'
                ? 'occupancy_report.pdf'
                : tab === 'directory'
                  ? 'directory.pdf'
                  : `report_${fileSlug(from, to)}.pdf`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'PDF generation failed.',
    };
  }
}

// ── Occupancy & Directory ─────────────────────────────────────────────────────

export async function fetchOccupancyAction(
  associationId: string,
): Promise<
  | { success: true; rows: import('./reports-types').OccupancyRow[] }
  | { success: false; error: string }
> {
  const role = await getAssociationRole(associationId);
  if (!role || !['assoc_admin', 'billing_operator'].includes(role))
    return { success: false, error: 'Access denied.' };

  const admin = getSupabaseServerAdminClient();

  // Fetch all units for this association
  const { data: units, error: uErr } = await admin
    .from('units')
    .select('id, unit_no, type, floor, area_sqft, owner_id')
    .eq('association_id', associationId)
    .neq('type', 'Common Area')
    .order('unit_no');
  if (uErr) return { success: false, error: uErr.message };

  // Fetch active tenancies
  const { data: tenancies, error: tErr } = await admin
    .from('tenancies')
    .select('unit_id, tenant_id, start_date')
    .is('end_date', null)
    .eq('status', 'active')
    .in(
      'unit_id',
      (units ?? []).map((u: any) => u.id),
    );
  if (tErr) return { success: false, error: tErr.message };

  // Collect all user IDs needing profile lookup
  const tenancyMap = new Map<
    string,
    { tenant_id: string; start_date: string }
  >();
  for (const t of tenancies ?? []) tenancyMap.set(t.unit_id, t);

  const userIds = new Set<string>();
  for (const u of units ?? []) if (u.owner_id) userIds.add(u.owner_id);
  for (const t of tenancies ?? []) userIds.add(t.tenant_id);

  const idList = Array.from(userIds);

  const [profilesRes, authRes] = await Promise.all([
    idList.length > 0
      ? admin
          .from('profiles')
          .select('id, full_name, mobile_number')
          .in('id', idList)
      : Promise.resolve({ data: [], error: null }),
    idList.length > 0
      ? admin.auth.admin.listUsers({ perPage: 1000 })
      : Promise.resolve({ data: { users: [] }, error: null }),
  ]);
  if (profilesRes.error)
    return { success: false, error: profilesRes.error.message };

  const profileMap = new Map<
    string,
    { full_name: string | null; mobile_number: string | null }
  >();
  for (const p of profilesRes.data ?? []) profileMap.set(p.id, p);

  const emailMap = new Map<string, string>();
  for (const u of (authRes as any).data?.users ?? [])
    emailMap.set(u.id, u.email ?? '');

  const rows: import('./reports-types').OccupancyRow[] = (units ?? []).map(
    (u: any) => {
      const tenancy = tenancyMap.get(u.id);
      const hasOwner = !!u.owner_id;
      const hasTenant = !!tenancy;
      const occupied = hasOwner || hasTenant;

      // For occupancy report: prefer tenant details if both exist, show "Owner + Tenant"
      const primaryId = hasTenant ? tenancy!.tenant_id : u.owner_id;
      const profile = primaryId ? profileMap.get(primaryId) : null;

      return {
        unit_id: u.id,
        unit_no: u.unit_no,
        type: u.type,
        floor: u.floor ?? null,
        area_sqft: Number(u.area_sqft),
        status: occupied ? 'Occupied' : 'Vacant',
        occupant_name: profile?.full_name ?? null,
        occupant_phone: profile?.mobile_number ?? null,
        occupant_email: primaryId ? (emailMap.get(primaryId) ?? null) : null,
        occupant_role:
          hasOwner && hasTenant
            ? 'Owner + Tenant'
            : hasOwner
              ? 'Owner'
              : hasTenant
                ? 'Tenant'
                : null,
        move_in_date: hasTenant ? tenancy!.start_date : null,
      };
    },
  );

  return { success: true, rows };
}

export async function fetchDirectoryAction(
  associationId: string,
): Promise<
  | { success: true; rows: import('./reports-types').DirectoryRow[] }
  | { success: false; error: string }
> {
  const role = await getAssociationRole(associationId);
  if (!role || !['assoc_admin', 'billing_operator'].includes(role))
    return { success: false, error: 'Access denied.' };

  const admin = getSupabaseServerAdminClient();

  const { data: units, error: uErr } = await admin
    .from('units')
    .select('id, unit_no, owner_id')
    .eq('association_id', associationId)
    .neq('type', 'Common Area')
    .order('unit_no');
  if (uErr) return { success: false, error: uErr.message };

  const { data: tenancies, error: tErr } = await admin
    .from('tenancies')
    .select('unit_id, tenant_id, start_date')
    .is('end_date', null)
    .eq('status', 'active')
    .in(
      'unit_id',
      (units ?? []).map((u: any) => u.id),
    );
  if (tErr) return { success: false, error: tErr.message };

  const tenancyByUnit = new Map<
    string,
    { tenant_id: string; start_date: string }
  >();
  for (const t of tenancies ?? []) tenancyByUnit.set(t.unit_id, t);

  const userIds = new Set<string>();
  for (const u of units ?? []) if (u.owner_id) userIds.add(u.owner_id);
  for (const t of tenancies ?? []) userIds.add(t.tenant_id);

  const idList = Array.from(userIds);
  const [profilesRes, authRes] = await Promise.all([
    idList.length > 0
      ? admin
          .from('profiles')
          .select('id, full_name, mobile_number')
          .in('id', idList)
      : Promise.resolve({ data: [], error: null }),
    idList.length > 0
      ? admin.auth.admin.listUsers({ perPage: 1000 })
      : Promise.resolve({ data: { users: [] }, error: null }),
  ]);
  if (profilesRes.error)
    return { success: false, error: profilesRes.error.message };

  const profileMap = new Map<
    string,
    { full_name: string | null; mobile_number: string | null }
  >();
  for (const p of profilesRes.data ?? []) profileMap.set(p.id, p);
  const emailMap = new Map<string, string>();
  for (const u of (authRes as any).data?.users ?? [])
    emailMap.set(u.id, u.email ?? '');

  const unitMap = new Map<string, string>();
  for (const u of units ?? []) unitMap.set(u.id, u.unit_no);

  const rows: import('./reports-types').DirectoryRow[] = [];

  for (const u of units ?? ([] as any[])) {
    if (u.owner_id) {
      const p = profileMap.get(u.owner_id);
      rows.push({
        unit_id: u.id,
        unit_no: u.unit_no,
        name: p?.full_name ?? '-',
        phone: p?.mobile_number ?? null,
        email: emailMap.get(u.owner_id) ?? null,
        role: 'Owner',
        move_in_date: null,
      });
    }
    const tenancy = tenancyByUnit.get(u.id);
    if (tenancy) {
      const p = profileMap.get(tenancy.tenant_id);
      rows.push({
        unit_id: u.id,
        unit_no: u.unit_no,
        name: p?.full_name ?? '-',
        phone: p?.mobile_number ?? null,
        email: emailMap.get(tenancy.tenant_id) ?? null,
        role: 'Tenant',
        move_in_date: tenancy.start_date,
      });
    }
  }

  return { success: true, rows };
}

export async function downloadOccupancyOrDirectoryCsvAction(
  associationId: string,
  tab: 'occupancy' | 'directory',
): Promise<
  | { success: true; csv: string; filename: string }
  | { success: false; error: string }
> {
  if (tab === 'occupancy') {
    const res = await fetchOccupancyAction(associationId);
    if (!res.success) return res;
    const csv = toCSVExport(
      [
        'Unit',
        'Type',
        'Floor',
        'Area (sqft)',
        'Status',
        'Occupant',
        'Phone',
        'Email',
        'Role',
        'Move-In Date',
      ],
      res.rows.map((r) => [
        r.unit_no,
        r.type,
        r.floor ?? '-',
        r.area_sqft,
        r.status,
        r.occupant_name ?? '-',
        r.occupant_phone ?? '-',
        r.occupant_email ?? '-',
        r.occupant_role ?? '-',
        r.move_in_date ?? '-',
      ]),
    );
    return { success: true, csv, filename: 'occupancy_report.csv' };
  } else {
    const res = await fetchDirectoryAction(associationId);
    if (!res.success) return res;
    const csv = toCSVExport(
      ['Unit', 'Name', 'Phone', 'Email', 'Role', 'Move-In Date'],
      res.rows.map((r) => [
        r.unit_no,
        r.name,
        r.phone ?? '-',
        r.email ?? '-',
        r.role,
        r.move_in_date ?? '-',
      ]),
    );
    return { success: true, csv, filename: 'directory.csv' };
  }
}

function toCSVExport(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
}

/**
 * Per-unit formal ledger statement for the association side.
 *
 * Bills raised are debits, payments received are credits, with a running
 * balance. Reuses the same accounting engine as the resident statement page so
 * advance netting and reversal handling cannot drift between the two views.
 *
 * Gated to assoc_admin only - this exposes a single unit's full financial
 * history, which billing_operator has no need to browse.
 */
export async function fetchLedgerStatementAction(
  associationId: string,
  unitId: string,
): Promise<
  | {
      success: true;
      rows: import('../../statement/_lib/statement-types').StatementEntry[];
    }
  | { success: false; error: string }
> {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    return { success: false, error: 'Access denied.' };
  }

  if (!unitId) return { success: true, rows: [] };

  const client = getSupabaseServerClient();

  // "All Units": association-wide overview. Balance accumulates across every
  // unit in date order, so the closing figure is the association's net position.
  if (unitId === LEDGER_ALL_UNITS) {
    const { data: allUnits, error: allErr } = await client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', associationId)
      .order('unit_no');

    if (allErr) return { success: false, error: allErr.message };
    if (!allUnits || allUnits.length === 0) return { success: true, rows: [] };

    try {
      const rows = await buildStatementEntries({
        client,
        associationId,
        unitIds: allUnits.map((u: { id: string; unit_no: string }) => u.id),
        unitNoMap: new Map(
          allUnits.map((u: { id: string; unit_no: string }) => [
            u.id,
            u.unit_no,
          ]),
        ),
        balanceMode: 'combined',
      });
      return { success: true, rows };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Could not build statement.',
      };
    }
  }

  // Confirm the unit belongs to this association before building a statement -
  // prevents a caller-supplied unit_id from reaching across associations.
  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id, unit_no')
    .eq('id', unitId)
    .eq('association_id', associationId)
    .maybeSingle();

  if (unitError) return { success: false, error: unitError.message };
  if (!unit) return { success: false, error: 'Unit not found.' };

  try {
    const rows = await buildStatementEntries({
      client,
      associationId,
      unitIds: [unit.id],
      unitNoMap: new Map([[unit.id, unit.unit_no]]),
    });
    return { success: true, rows };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Could not build statement.',
    };
  }
}

/**
 * PDF of a unit's (or the whole association's) ledger statement.
 *
 * Kept separate from downloadPdfAction because that one is scoped by the shared
 * date/unit filters, which cannot express "one picked unit, full history".
 */
export async function downloadLedgerStatementPdfAction(
  associationId: string,
  unitId: string,
): Promise<ActionResult<{ base64: string; filename: string }>> {
  // Start loading/warming the renderer; it overlaps the queries below.
  const rendererPromise = loadPdfRenderer();
  rendererPromise.catch(() => undefined);

  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    return { success: false, error: 'Access denied.' };
  }

  const { association, profile } = await resolveAssociation(associationId);
  if (!association) return { success: false, error: 'Association not found.' };

  const res = await fetchLedgerStatementAction(associationId, unitId);
  if (!res.success) return { success: false, error: res.error };

  const isAllUnits = unitId === LEDGER_ALL_UNITS;
  let unitLabel = 'All Units';
  if (!isAllUnits) {
    const client = getSupabaseServerClient();
    const { data: unit } = await client
      .from('units')
      .select('unit_no')
      .eq('id', unitId)
      .eq('association_id', associationId)
      .maybeSingle();
    if (!unit) return { success: false, error: 'Unit not found.' };
    unitLabel = unit.unit_no;
  }

  const accounts = association.accounts as {
    name: string;
    picture_url?: string | null;
  } | null;
  // Mirror the main downloadPdfAction fallback: associations.logo_url takes
  // priority; if null, use the account avatar (accounts.picture_url).
  const rawLogoUrl =
    (association.logo_url as string | null) ?? accounts?.picture_url ?? null;
  const logoUrl = await preprocessLogoForPdf(rawLogoUrl);

  const data: ReportPdfData = {
    association: {
      name: accounts?.name ?? 'Association',
      address: association.address,
      gstin: association.gstin,
      registrationNumber: association.registration_number,
      logoUrl,
      email: association.email,
      phone: association.phone,
    },
    periodLabel: isAllUnits ? 'All Units' : `Unit ${unitLabel}`,
    generatedAt: new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    generatedBy: profile?.full_name ?? 'Admin',
    activeSections: [],
    collection: {
      totalBilled: 0,
      totalCollected: 0,
      billCount: 0,
      byPeriod: [],
    },
    outstanding: { totalOutstanding: 0, overdueCount: 0, topBills: [] },
    payments: { total: 0, count: 0, byMode: [], recentPayments: [] },
    electricity: { totalCost: 0, totalUnits: 0, byPeriod: [] },
    ledgerStatement: {
      unitLabel,
      showUnitColumn: isAllUnits,
      rows: res.rows.map((r) => ({
        entry_date: r.entry_date,
        unit_no: r.unit_no,
        particulars: r.charge_name ?? billTypeLabel(r.bill_type),
        bill_no: r.bill_no,
        debit: r.direction === 'debit' ? r.amount : null,
        credit: r.direction === 'credit' ? r.amount : null,
        runningBalance: r.runningBalance,
        payment_status: r.payment_status ?? null,
      })),
    },
  };

  const { renderReportPdf } = await rendererPromise;
  const buffer = await renderReportPdf(data);
  const slug = isAllUnits
    ? 'all_units'
    : unitLabel.replace(/[^a-zA-Z0-9]+/g, '_');

  return {
    success: true,
    base64: Buffer.from(buffer).toString('base64'),
    filename: `unit_account_statement_${slug}.pdf`,
  };
}

/**
 * CSV of a unit's (or the whole association's) ledger statement.
 * Mirrors downloadLedgerStatementPdfAction so both exports come from one place.
 */
export async function downloadLedgerStatementCsvAction(
  associationId: string,
  unitId: string,
): Promise<ActionResult<{ csv: string; filename: string }>> {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    return { success: false, error: 'Access denied.' };
  }

  const res = await fetchLedgerStatementAction(associationId, unitId);
  if (!res.success) return { success: false, error: res.error };

  const isAllUnits = unitId === LEDGER_ALL_UNITS;
  let slug = 'all_units';

  if (!isAllUnits) {
    const client = getSupabaseServerClient();
    const { data: unit } = await client
      .from('units')
      .select('unit_no')
      .eq('id', unitId)
      .eq('association_id', associationId)
      .maybeSingle();
    if (!unit) return { success: false, error: 'Unit not found.' };
    slug = unit.unit_no.replace(/[^a-zA-Z0-9]+/g, '_');
  }

  const csv = toCSV(
    [
      'Date',
      'Unit',
      'Particulars',
      'Bill No.',
      'Mode',
      'Status',
      'Debit (₹)',
      'Credit (₹)',
      'Balance (₹)',
    ],
    res.rows.map((r) => [
      r.entry_date,
      r.unit_no,
      r.charge_name ?? billTypeLabel(r.bill_type),
      r.bill_no ?? '',
      r.mode ?? '',
      r.payment_status ?? '',
      r.direction === 'debit' ? r.amount : '',
      r.direction === 'credit' ? r.amount : '',
      r.runningBalance,
    ]),
  );

  return {
    success: true,
    csv,
    filename: `unit_account_statement_${slug}.csv`,
  };
}
