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
import {
  type AdvanceHistoryRow,
  OwnerPaymentsView,
} from './_components/owner-payments-view';
import {
  type BillPaymentRow,
  PaymentsSection,
} from './_components/payments-section';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ duration?: string; status?: string; unit?: string }>;
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
  const [{ account }, { duration, status, unit: unitParam }] =
    await Promise.all([params, searchParams]);
  const { role, userId, associationId, isSuperAdmin } = await requireRole(
    account,
    ['assoc_admin', 'billing_operator', 'prop_owner', 'tenant'],
  );

  const client = getSupabaseServerClient();

  const association = associationId ? { id: associationId } : null;

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  const isUserRestricted = role === 'prop_owner' || role === 'tenant';

  // Everything below is independent, so it runs as one parallel stage
  // instead of one round trip after another.
  //
  // - isSuperAdmin gates the "Delete all payments" danger-zone action. A
  //   super admin viewing an "opened workspace" resolves `role` to
  //   'assoc_admin' too, so it is checked independently of `role`.
  // - Owners/tenants: resolve their unit IDs first (needed to scope the
  //   bills query). A user may own one unit and rent another in the same
  //   association, so both are resolved independently:
  //   - owned units: the user sees every bill ever generated for them.
  //   - rented units: the user must only see bills attributed to their OWN
  //     tenancy (bills.tenancy_id) - otherwise a new tenant on a unit would
  //     see every past tenant's bill/payment history on that same unit.
  // - Owners/tenants: check whether the association has an active gateway.
  const [
    paymentsCountResult,
    receiptsCountResult,
    ownedUnitsResult,
    tenanciesResult,
    gatewayResult,
  ] = await Promise.all([
    isSuperAdmin
      ? client
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .eq('association_id', association.id)
      : null,
    isSuperAdmin
      ? client
          .from('receipts')
          .select('id, payments!inner(association_id)', {
            count: 'exact',
            head: true,
          })
          .eq('payments.association_id', association.id)
      : null,
    isUserRestricted
      ? client
          .from('units')
          .select('id, unit_no')
          .eq('association_id', association.id)
          .eq('owner_id', userId)
      : null,
    isUserRestricted
      ? client
          .from('tenancies')
          .select('id, unit_id, units!inner(association_id, unit_no)')
          .eq('tenant_id', userId)
          .eq('status', 'active')
          .eq('units.association_id', association.id)
      : null,
    isUserRestricted
      ? getSupabaseServerAdminClient()
          .from('association_payment_gateways')
          .select('is_active')
          .eq('association_id', association.id)
          .maybeSingle()
      : null,
  ]);

  const deletionCounts: { payments: number; receipts: number } | null =
    isSuperAdmin
      ? {
          payments: paymentsCountResult?.count ?? 0,
          receipts: receiptsCountResult?.count ?? 0,
        }
      : null;

  const gatewayActive = gatewayResult?.data?.is_active ?? false;

  const ownedUnits = ownedUnitsResult?.data ?? [];
  const tenancies = tenanciesResult?.data ?? [];
  const ownedUnitIds = ownedUnits.map((u) => u.id);
  const rentedUnitIds = tenancies.map((t) => t.unit_id);
  const myTenancyIds = tenancies.map((t) => t.id);

  if (isUserRestricted) {
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

  // Load all bills in one query - client filters instantly in-memory.
  let query = client
    .from('bills')
    .select(BILL_WITH_PAYMENTS_SELECT)
    .order('period', { ascending: false })
    .order('bill_no');

  if (isUserRestricted) {
    // Owned units: every bill, regardless of tenancy. Rented units: only
    // bills attributed to this tenant's own tenancy (or predating any
    // tenancy - self-occupied period bills with no tenant to hide from).
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
      // No accessible units - return nothing rather than falling through to
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

  // Void bills have no payments and carry no active obligation - exclude them
  // from both the admin metrics and the owner/tenant payment view.
  query = query.neq('status', 'Void');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uc = (c: unknown) => c as any;

  const allUnitIds = [...ownedUnitIds, ...rentedUnitIds];

  // For owners/tenants use the shared aggregation util (per-unit, no cross-unit
  // netting). For admins/operators use the association-wide RPC which covers all
  // units and includes the negative-balance filter already.

  // Unit numbers come back with the lookups above, so no extra query is
  // needed (needed both for balances and advance history).
  const unitNoById = new Map<string, string>();
  for (const u of ownedUnits) unitNoById.set(u.id, u.unit_no);
  for (const t of tenancies) {
    const unit = t.units as unknown as { unit_no: string } | null;
    if (unit) unitNoById.set(t.unit_id, unit.unit_no);
  }
  const unitsWithInfo: { id: string; unit_no: string }[] = [...unitNoById]
    .map(([id, unit_no]) => ({ id, unit_no }))
    .sort((a, b) =>
      a.unit_no.localeCompare(b.unit_no, undefined, { numeric: true }),
    );

  const [
    { data: bills },
    rawDues,
    { data: rawDuePaymentHistory },
    { data: rawAdvanceHistory },
    { data: activeTenancies },
  ] = await Promise.all([
    query,
    isUserRestricted
      ? loadUnitLedgerBalances(association.id, unitsWithInfo).then((balances) =>
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
    // Advance deposit history for owner/tenant
    isUserRestricted && allUnitIds.length > 0
      ? uc(client)
          .from('cash_ledger')
          .select(
            'id, unit_id, bill_type, amount, entry_date, razorpay_payment_id, units(unit_no)',
          )
          .in('unit_id', allUnitIds)
          .eq('association_id', association.id)
          .eq('entry_type', 'advance_payment')
          .order('entry_date', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    // Admin view: which units have an active tenancy, so PayDueDialog can
    // enable/disable the "Tenant" paid-by option. Fetched association-wide
    // (at most one row per unit) so it doesn't wait on the dues result.
    !isUserRestricted
      ? client
          .from('tenancies')
          .select('unit_id, units!inner(association_id)')
          .eq('status', 'active')
          .eq('units.association_id', association.id)
      : Promise.resolve({ data: [] as { unit_id: string }[] }),
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

  const advanceHistory: AdvanceHistoryRow[] = (
    (rawAdvanceHistory as
      | (Omit<AdvanceHistoryRow, 'unit_no'> & {
          units: { unit_no: string } | null;
        })[]
      | null) ?? []
  ).map((a) => ({
    ...a,
    unit_no: (a.units as { unit_no: string } | null)?.unit_no,
  }));

  const rawDuesArray = Array.isArray(rawDues)
    ? (rawDues as {
        unit_id: string;
        unit_no: string;
        bill_type: string;
        balance: number;
      }[])
    : [];

  const unitsWithActiveTenancy = new Set(
    (activeTenancies ?? []).map((t) => t.unit_id),
  );

  const cashLedgerDues: CashLedgerDueRow[] = rawDuesArray.map((r) => ({
    ...r,
    hasTenancy: unitsWithActiveTenancy.has(r.unit_id),
  }));

  const rows: BillPaymentRow[] = (bills ?? []).map((b) => ({
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    bill_type: b.bill_type ?? 'maintenance',
    unit_no: (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '-',
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
        paid_by_role: '-',
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
      ownerDescription = 'All paid up. Nothing due.';
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
          advanceHistory={advanceHistory}
          units={unitsWithInfo}
          canPay={gatewayActive}
          paidByRole={role === 'prop_owner' ? 'Owner' : 'Tenant'}
          account={account}
          showUnitColumn={allUnitCount > 1}
          // Only honour ?unit= for one of the caller's own units, and only
          // when there's more than one to choose from.
          focusUnitNo={
            allUnitCount > 1 &&
            unitsWithInfo.some((u) => u.unit_no === unitParam)
              ? unitParam
              : null
          }
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
