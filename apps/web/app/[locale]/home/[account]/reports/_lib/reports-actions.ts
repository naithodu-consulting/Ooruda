'use server';

import 'server-only';
import { renderReportPdf, type ReportPdfData } from '@kit/pdf-templates';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAssociationRole } from '~/lib/rbac';

type ActionResult<T = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: string };

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

const BILL_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  other_charges: 'Other Charges',
  sinking_fund: 'Sinking Fund',
};

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

/** File slug for download names: "2026-04_to_2026-07" or "all_time". */
function fileSlug(from: string, to: string): string {
  return from && to ? `${from}_to_${to}` : 'all_time';
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export async function downloadCsvAction(
  associationId: string,
  from: string,
  to: string,
  tab: string,
): Promise<ActionResult<{ csv: string; filename: string }>> {
  const client = getSupabaseServerClient();
  const role = await getAssociationRole(associationId);
  if (!role || !['assoc_admin', 'billing_operator'].includes(role)) {
    return { success: false, error: 'Access denied.' };
  }

  const fromPeriod = toPeriod(from);
  const toPeriod_ = toPeriod(to);
  const slug = fileSlug(from, to);

  if (tab === 'collection') {
    const rpcParams: Record<string, unknown> = {
      p_association_id: associationId,
    };
    if (fromPeriod) rpcParams['p_from_period'] = fromPeriod;
    if (toPeriod_) rpcParams['p_to_period'] = toPeriod_;

    const { data, error } = await (client as any).rpc(
      'get_collection_summary',
      rpcParams,
    );
    if (error) return { success: false, error: (error as any).message };
    const csv = toCSV(
      [
        'Period',
        'Bill Type',
        'Bill Count',
        'Billed (₹)',
        'Collected (₹)',
        'Outstanding (₹)',
      ],
      ((data as any[]) ?? []).map((r: any) => [
        r.period,
        BILL_TYPE_LABELS[r.bill_type] ?? r.bill_type,
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
        'period, bill_no, bill_type, total_amount, paid_amount, status, due_date, units(unit_no)',
      )
      .eq('association_id', associationId)
      .neq('status', 'Paid')
      .order('due_date');
    if (fromPeriod) q = (q as any).gte('period', fromPeriod);
    if (toPeriod_) q = (q as any).lte('period', toPeriod_);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    const csv = toCSV(
      [
        'Unit',
        'Bill No.',
        'Bill Type',
        'Period',
        'Billed (₹)',
        'Paid (₹)',
        'Outstanding (₹)',
        'Status',
        'Due Date',
      ],
      (data ?? []).map((b) => {
        const unit = b.units as { unit_no: string } | null;
        return [
          unit?.unit_no ?? '—',
          b.bill_no,
          BILL_TYPE_LABELS[b.bill_type ?? ''] ?? b.bill_type,
          b.period,
          b.total_amount,
          b.paid_amount,
          Number(b.total_amount) - Number(b.paid_amount),
          b.status,
          b.due_date,
        ];
      }),
    );
    return { success: true, csv, filename: `outstanding_${slug}.csv` };
  }

  if (tab === 'payments') {
    let q = (client as any)
      .from('payments')
      .select(
        'amount, mode, reference_no, paid_at, bills(bill_no, bill_type, units(unit_no)), receipts(receipt_no)',
      )
      .eq('association_id', associationId)
      .eq('status', 'active')
      .order('paid_at', { ascending: false });
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (from && ISO_DATE.test(from)) q = q.gte('paid_at', from);
    if (to && ISO_DATE.test(to)) q = q.lte('paid_at', `${to}T23:59:59.999`);
    const { data, error } = await q;
    if (error) return { success: false, error: (error as any).message };
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
      ],
      ((data as any[]) ?? []).map((p: any) => {
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
          BILL_TYPE_LABELS[bill?.bill_type ?? ''] ?? bill?.bill_type ?? '—',
          p.amount,
          p.mode,
          p.reference_no ?? '',
          (receipt as { receipt_no: string } | null)?.receipt_no ?? '',
        ];
      }),
    );
    return { success: true, csv, filename: `payments_${slug}.csv` };
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
): Promise<ActionResult<{ base64: string; filename: string }>> {
  const { client, association } = await resolveAssociation(associationId);
  if (!association) return { success: false, error: 'Access denied.' };

  const fromPeriod = toPeriod(from);
  const toPeriod_ = toPeriod(to);

  // Build collection RPC — omit period params for All Time
  const rpcParams: Record<string, unknown> = {
    p_association_id: associationId,
  };
  if (fromPeriod) rpcParams['p_from_period'] = fromPeriod;
  if (toPeriod_) rpcParams['p_to_period'] = toPeriod_;

  // Build outstanding bills query
  let billsQ = client
    .from('bills')
    .select(
      'bill_no, bill_type, total_amount, paid_amount, status, due_date, period, units(unit_no)',
    )
    .eq('association_id', associationId)
    .neq('status', 'Paid')
    .order('due_date')
    .limit(50);
  if (fromPeriod) billsQ = (billsQ as any).gte('period', fromPeriod);
  if (toPeriod_) billsQ = (billsQ as any).lte('period', toPeriod_);

  // Build payments query
  const ISO_DATE_PDF = /^\d{4}-\d{2}-\d{2}$/;
  let paymentsQ = (client as any)
    .from('payments')
    .select('amount, mode, paid_at, status, bills(bill_no, units(unit_no))')
    .eq('association_id', associationId)
    .eq('status', 'active')
    .order('paid_at', { ascending: false })
    .limit(50);
  if (from && ISO_DATE_PDF.test(from)) paymentsQ = paymentsQ.gte('paid_at', from);
  if (to && ISO_DATE_PDF.test(to))
    paymentsQ = paymentsQ.lte('paid_at', `${to}T23:59:59.999`);

  // Build electricity query
  let elecQ = client
    .from('mescom_bills')
    .select('period, invoice_amount, block_consumption_units')
    .eq('association_id', associationId)
    .order('period', { ascending: false });
  if (fromPeriod) elecQ = (elecQ as any).gte('period', fromPeriod);
  if (toPeriod_) elecQ = (elecQ as any).lte('period', toPeriod_);

  const [
    collectionRes,
    outstandingRes,
    paymentsRes,
    electricityRes,
    profileRes,
  ] = await Promise.all([
    (client as any).rpc('get_collection_summary', rpcParams),
    billsQ,
    paymentsQ,
    elecQ,
    client.from('profiles').select('full_name').maybeSingle(),
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

  // Aggregate collection by period (sum across bill types)
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
        (s, b) => s + Number(b.total_amount) - Number(b.paid_amount),
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
        outstanding: Number(b.total_amount) - Number(b.paid_amount),
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
