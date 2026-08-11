import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { displayBillStatus } from '~/lib/bill-status';
import { loadUnitLedgerBalances } from '~/lib/cash-ledger-aggregation';
import { formatINR } from '~/lib/format-inr';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  type CashLedgerDueRow,
  CashLedgerDuesSection,
} from './_components/cash-ledger-dues-section';
import { OwnerPaymentsView } from './_components/owner-payments-view';
import {
  type BillPaymentRow,
  PaymentsSection,
} from './_components/payments-section';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ duration?: string; status?: string }>;
}

export const metadata = { title: 'Payments' };

type RawPayment = {
  id: string;
  amount: number;
  mode: string;
  reference_no: string | null;
  paid_by_role: string;
  paid_at: string;
  receipts: { receipt_no: string } | { receipt_no: string }[] | null;
};

function receiptNoOf(payment: RawPayment): string | null {
  if (Array.isArray(payment.receipts)) {
    return payment.receipts[0]?.receipt_no ?? null;
  }
  return payment.receipts?.receipt_no ?? null;
}

const BILL_WITH_PAYMENTS_SELECT =
  'id, period, bill_no, bill_type, total_amount, paid_amount, advance_applied, status, due_date, tenancy_id, units(unit_no), payments(id, amount, mode, reference_no, paid_by_role, paid_at, receipts(receipt_no)), advance_application_receipts(id, voucher_no, amount, applied_at)';

export default async function PaymentsPage({ params, searchParams }: Props) {
  const [{ account }, { duration, status }] = await Promise.all([
    params,
    searchParams,
  ]);
  const { accountId, role, userId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
    'tenant',
  ]);

  const client = getSupabaseServerClient();

  // isSuperAdmin gates the "Delete all payments" danger-zone action — a
  // super admin viewing an "opened workspace" resolves `role` to
  // 'assoc_admin' too, so this must be checked independently of `role`.
  const { data: isSuperAdmin } = await client.rpc('is_super_admin');

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  let deletionCounts: { payments: number; receipts: number } | null = null;
  if (isSuperAdmin) {
    const [{ count: paymentsCount }, { count: receiptsCount }] =
      await Promise.all([
        client
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .eq('association_id', association.id),
        client
          .from('receipts')
          .select('id, payments!inner(association_id)', {
            count: 'exact',
            head: true,
          })
          .eq('payments.association_id', association.id),
      ]);
    deletionCounts = {
      payments: paymentsCount ?? 0,
      receipts: receiptsCount ?? 0,
    };
  }

  const isUserRestricted = role === 'prop_owner' || role === 'tenant';

  // For owners/tenants resolve their unit IDs first (needed to scope the
  // query). A user may own one unit and rent another in the same
  // association, so we resolve both independently:
  // - owned units: the user sees every bill ever generated for them.
  // - rented units: the user must only see bills attributed to their OWN
  //   tenancy (bills.tenancy_id) — otherwise a new tenant on a unit would
  //   see every past tenant's bill/payment history on that same unit.
  let ownedUnitIds: string[] = [];
  let rentedUnitIds: string[] = [];
  let myTenancyIds: string[] = [];
  if (isUserRestricted) {
    const [{ data: ownedUnits }, { data: tenancies }] = await Promise.all([
      client
        .from('units')
        .select('id')
        .eq('association_id', association.id)
        .eq('owner_id', userId),
      client
        .from('tenancies')
        .select('id, unit_id, units!inner(association_id)')
        .eq('tenant_id', userId)
        .eq('status', 'active')
        .eq('units.association_id', association.id),
    ]);
    ownedUnitIds = (ownedUnits ?? []).map((u) => u.id);
    rentedUnitIds = (tenancies ?? []).map((t) => t.unit_id);
    myTenancyIds = (tenancies ?? []).map((t) => t.id);

    if (ownedUnitIds.length === 0 && rentedUnitIds.length === 0) {
      return (
        <PageBody>
          <TeamAccountLayoutPageHeader
            account={account}
            title={<Trans i18nKey="association.nav.payments" />}
            description="No bills yet"
          />
          <PaymentsSection
            associationId={association.id}
            bills={[]}
            canManage={false}
            canVoid={false}
            canPay={false}
            title="Your payments"
            description="Every payment recorded against your bill(s)."
            initialDuration={duration}
            initialStatus={status}
          />
        </PageBody>
      );
    }
  }

  // For owners/tenants check if this association has an active payment gateway.
  let gatewayActive = false;
  if (isUserRestricted) {
    const admin = getSupabaseServerAdminClient();
    const { data: gateway } = await admin
      .from('association_payment_gateways')
      .select('is_active')
      .eq('association_id', association.id)
      .maybeSingle();
    gatewayActive = gateway?.is_active ?? false;
  }

  // Load all bills in one query — client filters instantly in-memory.
  let query = client
    .from('bills')
    .select(BILL_WITH_PAYMENTS_SELECT)
    .order('period', { ascending: false })
    .order('bill_no');

  if (isUserRestricted) {
    // Owned units: every bill, regardless of tenancy. Rented units: only
    // bills attributed to this tenant's own tenancy (or predating any
    // tenancy — self-occupied period bills with no tenant to hide from).
    const filters: string[] = [];
    if (ownedUnitIds.length > 0) {
      filters.push(`unit_id.in.(${ownedUnitIds.join(',')})`);
    }
    if (rentedUnitIds.length > 0) {
      const tenancyFilter =
        myTenancyIds.length > 0
          ? `or(tenancy_id.is.null,tenancy_id.in.(${myTenancyIds.join(',')}))`
          : 'tenancy_id.is.null';
      filters.push(
        `and(unit_id.in.(${rentedUnitIds.join(',')}),${tenancyFilter})`,
      );
    }
    if (filters.length === 0) {
      // No accessible units — return nothing rather than falling through to
      // an empty .or('') which PostgREST treats as no filter (returns all rows).
      return (
        <PageBody>
          <TeamAccountLayoutPageHeader
            account={account}
            title={<Trans i18nKey="association.nav.payments" />}
            description=""
          />
          <p className="text-muted-foreground py-8 text-center text-sm">
            No units found for your account.
          </p>
        </PageBody>
      );
    }
    query = query.or(filters.join(','));
  } else {
    query = query.eq('association_id', association.id);
  }

  // Void bills have no payments and carry no active obligation — exclude them
  // from both the admin metrics and the owner/tenant payment view.
  query = query.neq('status', 'Void');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uc = (c: unknown) => c as any;

  const allUnitIds = [...ownedUnitIds, ...rentedUnitIds];

  // For owners/tenants use the shared aggregation util (per-unit, no cross-unit
  // netting). For admins/operators use the association-wide RPC which covers all
  // units and includes the negative-balance filter already.
  const [{ data: bills }, rawDues, { data: rawDuePaymentHistory }] =
    await Promise.all([
      query,
      isUserRestricted
        ? loadUnitLedgerBalances(
            association.id,
            allUnitIds.length > 0
              ? await client
                  .from('units')
                  .select('id, unit_no')
                  .in('id', allUnitIds)
                  .then(
                    ({ data }) =>
                      (data ?? []) as { id: string; unit_no: string }[],
                  )
              : [],
          ).then((balances) =>
            balances.flatMap((b) =>
              b.dues.map((d) => ({
                unit_id: b.unit_id,
                unit_no: b.unit_no,
                bill_type: d.bill_type,
                balance: -d.amount,
              })),
            ),
          )
        : uc(client)
            .rpc('get_association_cash_ledger_balances', {
              p_association_id: association.id,
            })
            .then(
              ({
                data,
              }: {
                data:
                  | {
                      unit_id: string;
                      unit_no: string;
                      bill_type: string;
                      balance: number;
                    }[]
                  | null;
              }) =>
                (data ?? [])
                  .filter((r) => r.balance < 0)
                  .map((r) => ({ ...r, balance: Number(r.balance) })),
            ),
      // Cash ledger payment history for owner/tenant recent payments
      isUserRestricted && allUnitIds.length > 0
        ? uc(client)
            .from('cash_ledger_payments')
            .select(
              'id, unit_id, bill_type, amount, mode, paid_at, receipt_no, units(unit_no)',
            )
            .in('unit_id', allUnitIds)
            .eq('association_id', association.id)
            .order('paid_at', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]);

  type DuePaymentHistoryRow = {
    id: string;
    unit_id: string;
    unit_no?: string;
    bill_type: string;
    amount: number;
    mode: string;
    paid_at: string;
    receipt_no: string | null;
  };
  const duePaymentHistory: DuePaymentHistoryRow[] = (
    (rawDuePaymentHistory as
      | (Omit<DuePaymentHistoryRow, 'unit_no'> & {
          units: { unit_no: string } | null;
        })[]
      | null) ?? []
  ).map((dp) => ({
    ...dp,
    unit_no: (dp.units as { unit_no: string } | null)?.unit_no,
  }));

  const rawDuesArray = Array.isArray(rawDues)
    ? (rawDues as {
        unit_id: string;
        unit_no: string;
        bill_type: string;
        balance: number;
      }[])
    : [];

  // For admin view: determine which due units have an active tenancy so the
  // PayDueDialog can enable/disable the "Tenant" paid-by option correctly.
  let unitsWithActiveTenancy = new Set<string>();
  if (!isUserRestricted && rawDuesArray.length > 0) {
    const dueUnitIds = [...new Set(rawDuesArray.map((r) => r.unit_id))];
    const { data: activeTenancies } = await client
      .from('tenancies')
      .select('unit_id')
      .in('unit_id', dueUnitIds)
      .eq('status', 'active');
    unitsWithActiveTenancy = new Set(
      (activeTenancies ?? []).map((t) => t.unit_id),
    );
  }

  const cashLedgerDues: CashLedgerDueRow[] = rawDuesArray.map((r) => ({
    ...r,
    hasTenancy: unitsWithActiveTenancy.has(r.unit_id),
  }));

  const rows: BillPaymentRow[] = (bills ?? []).map((b) => ({
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    bill_type: b.bill_type ?? 'maintenance',
    unit_no: (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
    total_amount: Number(b.total_amount),
    paid_amount: Number(b.paid_amount),
    advance_applied: Number(
      (b as unknown as { advance_applied?: number }).advance_applied ?? 0,
    ),
    status: b.status,
    due_date: b.due_date,
    tenancy_id:
      (b as unknown as { tenancy_id: string | null }).tenancy_id ?? null,
    payments: [
      ...((b.payments as unknown as RawPayment[] | null) ?? []).map((p) => ({
        id: p.id,
        amount: p.amount,
        mode: p.mode,
        reference_no: p.reference_no ?? null,
        paid_by_role: p.paid_by_role,
        paid_at: p.paid_at,
        receipt_no: receiptNoOf(p),
        is_advance: false as const,
      })),
      ...(
        (
          b as unknown as {
            advance_application_receipts?: {
              id: string;
              voucher_no: string;
              amount: number;
              applied_at: string;
            }[];
          }
        ).advance_application_receipts ?? []
      ).map((a) => ({
        id: a.id,
        amount: a.amount,
        mode: 'Advance Applied',
        reference_no: null,
        paid_by_role: '—',
        paid_at: a.applied_at,
        receipt_no: a.voucher_no,
        is_advance: true as const,
      })),
    ],
  }));

  const allUnitCount = allUnitIds.length;

  let ownerDescription = 'Your bills and payment history.';
  if (isUserRestricted) {
    const totalOwed =
      rows.reduce((sum, b) => {
        const owed = b.total_amount - b.paid_amount - (b.advance_applied ?? 0);
        return owed > 0.009 ? sum + owed : sum;
      }, 0) + cashLedgerDues.reduce((sum, d) => sum + Math.abs(d.balance), 0);
    if (totalOwed <= 0) {
      ownerDescription = 'All paid up — nothing due.';
    } else {
      const overdueCount = rows.filter((b) => {
        const owed = b.total_amount - b.paid_amount - (b.advance_applied ?? 0);
        return owed > 0.009 && displayBillStatus(b) === 'Overdue';
      }).length;
      ownerDescription =
        overdueCount > 0
          ? `${overdueCount} overdue · ${formatINR(totalOwed)} total due`
          : `${formatINR(totalOwed)} outstanding`;
    }
  }

  if (isUserRestricted) {
    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.payments" />}
          description={ownerDescription}
        />
        <OwnerPaymentsView
          associationId={association.id}
          bills={rows}
          dues={cashLedgerDues}
          duePaymentHistory={duePaymentHistory}
          canPay={gatewayActive}
          paidByRole={role === 'prop_owner' ? 'Owner' : 'Tenant'}
          account={account}
          showUnitColumn={allUnitCount > 1}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.payments" />}
        description={
          rows.length === 0 ? 'No bills yet' : `${rows.length} bills`
        }
      />

      <PaymentsSection
        associationId={association.id}
        bills={rows}
        canManage={role === 'assoc_admin' || role === 'billing_operator'}
        canVoid={role === 'assoc_admin'}
        isSuperAdmin={!!isSuperAdmin}
        deletionCounts={deletionCounts}
        canPay={false}
        title="Payments"
        initialDuration={duration}
        initialStatus={status}
        description="Record payments against bills and track receipts."
        accountSlug={account}
      />

      {cashLedgerDues.length > 0 && (
        <div className="mt-6">
          <CashLedgerDuesSection
            associationId={association.id}
            dues={cashLedgerDues}
            canManage={role === 'assoc_admin' || role === 'billing_operator'}
            canPay={false}
            isOwnerView={false}
            unitCount={allUnitCount}
          />
        </div>
      )}
    </PageBody>
  );
}
