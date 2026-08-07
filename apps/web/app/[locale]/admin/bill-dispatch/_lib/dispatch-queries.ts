'use server';

import 'server-only';
import { isSuperAdmin } from '@kit/admin';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { VALID_BILL_TYPES } from './dispatch-config';

export interface AssociationOption {
  id: string;
  name: string;
}

export interface DispatchBillRow {
  billId: string;
  receiptId: string | null;
  paymentId: string | null;
  unitId: string;
  unitNo: string;
  ownerName: string;
  ownerEmail: string | null;
  tenantName: string | null;
  tenantEmail: string | null;
  period: string;
  billNo: string;
  billType: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
  pdfUrl: string | null;
  receiptPdfUrl: string | null;
}

export async function fetchAssociationsForDispatch(): Promise<
  AssociationOption[]
> {
  if (!(await isSuperAdmin(getSupabaseServerClient()))) {
    throw new Error('Unauthorized');
  }

  const client = getSupabaseServerAdminClient();
  const { data } = await client
    .from('accounts')
    .select('id, name')
    .eq('is_personal_account', false)
    .order('name');
  return (data ?? []).map((a) => ({ id: a.id, name: a.name ?? a.id }));
}

export async function fetchBillsForDispatch(params: {
  associationId: string;
  mode: 'bills' | 'receipts';
  periods: string[];
  billType: string;
}): Promise<DispatchBillRow[]> {
  if (!(await isSuperAdmin(getSupabaseServerClient()))) {
    throw new Error('Unauthorized');
  }

  const { associationId, mode, periods, billType } = params;

  // Validate billType against whitelist to prevent PostgREST filter injection
  if (billType !== 'All') {
    const isValid = (VALID_BILL_TYPES as readonly string[]).includes(billType);
    if (!isValid) throw new Error(`Invalid bill type: ${billType}`);
  }

  const client = getSupabaseServerAdminClient();

  // Resolve association → its team account id
  const { data: assoc } = await client
    .from('associations')
    .select('id, account_id')
    .eq('account_id', associationId)
    .maybeSingle();

  const assocId = assoc?.id ?? associationId;

  let query = client
    .from('bills')
    .select(
      `id, unit_id, period, bill_no, bill_type, total_amount, paid_amount,
       status, due_date, pdf_url,
       units!inner(unit_no, owner_id)`,
    )
    .eq('association_id', assocId)
    .in('period', periods)
    .in('status', ['Unpaid', 'Partial', 'Paid', 'Overdue'])
    .limit(50);

  if (billType !== 'All') {
    // DB stores bill_type as lowercase_underscore (e.g. "other_charges").
    // billType is already validated against VALID_BILL_TYPES whitelist above.
    const normalized = billType.toLowerCase().replace(/ /g, '_');
    // Use separate .ilike() chained as .or() — both forms safe since they come from the whitelist.
    query = query.or(
      `bill_type.ilike.${normalized},bill_type.ilike.${billType.toLowerCase()}`,
    );
  }

  if (mode === 'receipts') {
    query = query.eq('status', 'Paid');
  }

  const { data: bills } = await query;
  if (!bills || bills.length === 0) return [];

  const billIds = bills.map((b) => b.id);
  const unitIds = bills.map((b) => b.unit_id);
  const ownerIds = [
    ...new Set(
      bills
        .map((b) => {
          const u = b.units as {
            unit_no: string;
            owner_id: string | null;
          } | null;
          return u?.owner_id ?? null;
        })
        .filter(Boolean) as string[],
    ),
  ];

  // Collapse bills→payments→receipts chain + tenancies + profiles into
  // 3 parallel queries instead of 4 sequential ones.
  const [paymentsWithReceiptsResult, tenancyResult] = await Promise.all([
    // Single join: payments + nested receipts eliminates a serial hop.
    client
      .from('payments')
      .select('id, bill_id, receipts(id, pdf_url)')
      .in('bill_id', billIds)
      .order('paid_at', { ascending: false }),
    unitIds.length > 0
      ? client
          .from('tenancies')
          .select('unit_id, tenant_id')
          .in('unit_id', unitIds)
          .eq('status', 'active')
          .is('end_date', null)
      : Promise.resolve({ data: [] }),
  ]);

  type PaymentWithReceipt = {
    id: string;
    bill_id: string;
    receipts: { id: string; pdf_url: string | null }[];
  };

  const receiptByBill = new Map<
    string,
    { id: string; payment_id: string; pdf_url: string | null }
  >();
  const paymentIdByBill = new Map<string, string>();
  for (const p of (paymentsWithReceiptsResult.data ??
    []) as unknown as PaymentWithReceipt[]) {
    if (!receiptByBill.has(p.bill_id) && p.receipts?.length) {
      const r = p.receipts[0]!;
      receiptByBill.set(p.bill_id, {
        id: r.id,
        payment_id: p.id,
        pdf_url: r.pdf_url,
      });
    }
    if (!paymentIdByBill.has(p.bill_id)) {
      paymentIdByBill.set(p.bill_id, p.id);
    }
  }

  const tenancyMap = new Map<string, string>();
  for (const t of (tenancyResult.data ?? []) as {
    unit_id: string;
    tenant_id: string;
  }[]) {
    tenancyMap.set(t.unit_id, t.tenant_id);
  }

  const tenantIds = [...new Set([...tenancyMap.values()])];
  const allProfileIds = [...new Set([...ownerIds, ...tenantIds])];

  const profileMap = new Map<
    string,
    { full_name: string | null; email: string | null }
  >();
  if (allProfileIds.length > 0) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, full_name, email')
      .in('id', allProfileIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  return bills.map((b) => {
    const unit = b.units as { unit_no: string; owner_id: string | null } | null;
    const receipt = receiptByBill.get(b.id) ?? null;
    const ownerProfile = unit?.owner_id ? profileMap.get(unit.owner_id) : null;
    const tenantId = tenancyMap.get(b.unit_id) ?? null;
    const tenantProfile = tenantId ? profileMap.get(tenantId) : null;

    return {
      billId: b.id,
      receiptId: receipt?.id ?? null,
      paymentId: paymentIdByBill.get(b.id) ?? null,
      unitId: b.unit_id,
      unitNo: unit?.unit_no ?? b.unit_id,
      ownerName: ownerProfile?.full_name ?? '—',
      ownerEmail: ownerProfile?.email ?? null,
      tenantName: tenantProfile?.full_name ?? null,
      tenantEmail: tenantProfile?.email ?? null,
      period: b.period,
      billNo: b.bill_no,
      billType: b.bill_type,
      totalAmount: b.total_amount,
      paidAmount: b.paid_amount,
      status: b.status,
      dueDate: b.due_date,
      pdfUrl: b.pdf_url,
      receiptPdfUrl: receipt?.pdf_url ?? null,
    };
  });
}
