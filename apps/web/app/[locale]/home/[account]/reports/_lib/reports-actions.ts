'use server';

import 'server-only';
import {
  billTypeLabel,
  renderReportPdf,
  type ReportPdfData,
} from '@kit/pdf-templates';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAssociationRole } from '~/lib/rbac';

import type { ReportsFilters } from './reports-types';

type ActionResult<T = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: string };

type TabKey =
  | 'collection'
  | 'outstanding'
  | 'payments'
  | 'cash_ledger'
  | 'electricity';

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
        'id, name: accounts(name), address, gstin, logo_url, registration_number, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch',
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
    const s = String(v);
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

    const { data, error } = await (client as any).rpc(
      'get_collection_summary',
      rpcParams,
    );
    if (error) return { success: false, error: (error as any).message };

    const rows: any[] = data ?? [];

    const csv = toCSV(
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
          unit?.unit_no ?? '—',
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
        bill?.units?.unit_no ?? '—',
        bill?.bill_no ?? '—',
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
        unit?.unit_no ?? '—',
        '—',
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
          unit?.unit_no ?? '—',
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
      (data ?? []).map((r) => [
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
  const { client, association } = await resolveAssociation(associationId);
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
    cash_ledger: ['collection', 'outstanding', 'payments', 'electricity'],
    electricity: ['electricity'],
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
    .select('period, invoice_amount, block_consumption_units')
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
    profileRes,
    unitNosRes,
  ] = await Promise.all([
    collectionPromise,
    outstandingPromise,
    paymentsPromise,
    electricityPromise,
    client.from('profiles').select('full_name').maybeSingle(),
    unitNosPromise,
  ]);

  if (collectionRes.error) {
    return {
      success: false,
      error: `Collection summary failed: ${(collectionRes.error as any).message ?? 'unknown error'}`,
    };
  }

  const collectionRows: any[] = (collectionRes.data as any[]) ?? [];

  const outstandingBills = outstandingRes.data ?? [];
  const paymentRows = paymentsRes.data ?? [];
  const mescomRows = electricityRes.data ?? [];

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

  const assocName =
    typeof association.name === 'object' && association.name !== null
      ? ((association.name as { name?: string }).name ?? 'Association')
      : String(association.name ?? 'Association');

  const data: ReportPdfData = {
    association: {
      name: assocName,
      address: association.address ?? null,
      gstin: association.gstin ?? null,
      registrationNumber: association.registration_number ?? null,
      logoUrl: association.logo_url ?? null,
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
      topBills: outstandingBills.map((b) => ({
        unit_no: (b.units as { unit_no: string } | null)?.unit_no ?? '—',
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
          unit_no: bill?.units?.unit_no ?? '—',
          bill_no: bill?.bill_no ?? '—',
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
    },
    activeSections,
    appliedFilters: {
      unitNos:
        (unitNosRes.data ?? []).length > 0
          ? (unitNosRes.data ?? []).map((u: { unit_no: string }) => u.unit_no)
          : undefined,
      billTypes:
        billTypes.length > 0
          ? billTypes.map((bt) => billTypeLabel(bt))
          : undefined,
    },
  };

  try {
    const buffer = await renderReportPdf(data);
    const base64 = buffer.toString('base64');
    return {
      success: true,
      base64,
      filename: `report_${fileSlug(from, to)}.pdf`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'PDF generation failed.',
    };
  }
}
