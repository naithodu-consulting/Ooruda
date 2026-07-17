import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { loadUnitLedgerBalances } from '~/lib/cash-ledger-aggregation';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  type CashLedgerDueRow,
  type PaidDueRow,
  CashLedgerDuesSection,
} from './_components/cash-ledger-dues-section';
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
  'id, period, bill_no, bill_type, total_amount, paid_amount, advance_applied, status, due_date, units(unit_no), payments(id, amount, mode, reference_no, paid_by_role, paid_at, receipts(receipt_no))';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uc = (c: unknown) => c as any;

  const allUnitIds = [...ownedUnitIds, ...rentedUnitIds];

  // For owners/tenants use the shared aggregation util (per-unit, no cross-unit
  // netting). For admins/operators use the association-wide RPC which covers all
  // units and includes the negative-balance filter already.
  const [{ data: bills }, rawDues, rawPaidDues] = await Promise.all([
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
    // Paid due payments for owners/tenants (cash ledger payments for their units).
    isUserRestricted && allUnitIds.length > 0
      ? uc(client)
          .from('cash_ledger_payments')
          .select('unit_id, bill_type, amount, paid_at, mode, units(unit_no)')
          .in('unit_id', allUnitIds)
          .eq('association_id', association.id)
          .order('paid_at', { ascending: false })
          .then(
            ({
              data,
            }: {
              data:
                | {
                    unit_id: string;
                    bill_type: string;
                    amount: number;
                    paid_at: string;
                    mode: string;
                    units: { unit_no: string } | null;
                  }[]
                | null;
            }) => data ?? [],
          )
      : Promise.resolve([]),
  ]);

  const cashLedgerDues: CashLedgerDueRow[] = Array.isArray(rawDues)
    ? (rawDues as {
        unit_id: string;
        unit_no: string;
        bill_type: string;
        balance: number;
      }[])
    : [];

  const cashLedgerPaidDues: PaidDueRow[] = (
    rawPaidDues as {
      unit_id: string;
      bill_type: string;
      amount: number;
      paid_at: string;
      mode: string;
      units: { unit_no: string } | null;
    }[]
  ).map((p) => ({
    unit_id: p.unit_id,
    unit_no: p.units?.unit_no ?? '?',
    bill_type: p.bill_type,
    amount: Number(p.amount),
    paid_at: p.paid_at,
    mode: p.mode,
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
    payments: ((b.payments as unknown as RawPayment[] | null) ?? []).map(
      (p) => ({
        id: p.id,
        amount: p.amount,
        mode: p.mode,
        reference_no: p.reference_no ?? null,
        paid_by_role: p.paid_by_role,
        paid_at: p.paid_at,
        receipt_no: receiptNoOf(p),
      }),
    ),
  }));

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.payments" />}
        description={
          isUserRestricted
            ? 'Bills and payment history for your unit(s).'
            : rows.length === 0
              ? 'No bills yet'
              : `${rows.length} bills`
        }
      />

      <PaymentsSection
        associationId={association.id}
        bills={rows}
        canManage={
          !isUserRestricted &&
          (role === 'assoc_admin' || role === 'billing_operator')
        }
        canVoid={!isUserRestricted && role === 'assoc_admin'}
        isSuperAdmin={!!isSuperAdmin}
        deletionCounts={deletionCounts}
        canPay={isUserRestricted && gatewayActive}
        paidByRole={
          isUserRestricted
            ? role === 'prop_owner'
              ? 'Owner'
              : 'Tenant'
            : undefined
        }
        title={isUserRestricted ? 'Your payments' : 'Payments'}
        hideUnitColumn={
          isUserRestricted && [...ownedUnitIds, ...rentedUnitIds].length <= 1
        }
        initialDuration={duration ?? (isUserRestricted ? 'this_fy' : undefined)}
        initialStatus={status}
        description={
          isUserRestricted
            ? 'Every payment recorded against your bills.'
            : 'Record payments against bills and track receipts.'
        }
        accountSlug={account}
      />

      {(cashLedgerDues.length > 0 || cashLedgerPaidDues.length > 0) && (
        <div className="mt-6">
          <CashLedgerDuesSection
            associationId={association.id}
            dues={cashLedgerDues}
            paidDues={isUserRestricted ? cashLedgerPaidDues : undefined}
            canManage={
              !isUserRestricted &&
              (role === 'assoc_admin' || role === 'billing_operator')
            }
            canPay={isUserRestricted && gatewayActive}
            isOwnerView={isUserRestricted}
            unitCount={[...ownedUnitIds, ...rentedUnitIds].length}
          />
        </div>
      )}
    </PageBody>
  );
}
