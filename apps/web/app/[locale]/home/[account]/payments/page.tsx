import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
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
  'id, period, bill_no, bill_type, total_amount, paid_amount, status, due_date, units(unit_no), payments(id, amount, mode, paid_by_role, paid_at, receipts(receipt_no))';

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

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  const isUserRestricted = role === 'prop_owner' || role === 'tenant';

  // For owners/tenants resolve their unit IDs first (needed to scope the query).
  // A user may own one unit and rent another in the same association, so we
  // union both ownership and active tenancy unit IDs regardless of their role.
  let unitIds: string[] = [];
  if (isUserRestricted) {
    const [{ data: ownedUnits }, { data: tenancies }] = await Promise.all([
      client
        .from('units')
        .select('id')
        .eq('association_id', association.id)
        .eq('owner_id', userId),
      client
        .from('tenancies')
        .select('unit_id, units!inner(association_id)')
        .eq('tenant_id', userId)
        .eq('status', 'active')
        .eq('units.association_id', association.id),
    ]);
    const owned = (ownedUnits ?? []).map((u) => u.id);
    const rented = (tenancies ?? []).map((t) => t.unit_id);
    unitIds = [...new Set([...owned, ...rented])];

    if (unitIds.length === 0) {
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
            title="Your payments"
            description="Every payment recorded against your bill(s)."
            initialDuration={duration}
            initialStatus={status}
          />
        </PageBody>
      );
    }
  }

  // Load all bills in one query — client filters instantly in-memory.
  let query = client
    .from('bills')
    .select(BILL_WITH_PAYMENTS_SELECT)
    .order('period', { ascending: false })
    .order('bill_no');

  if (isUserRestricted) {
    query = query.in('unit_id', unitIds);
  } else {
    query = query.eq('association_id', association.id);
  }

  const { data: bills } = await query;

  const rows: BillPaymentRow[] = (bills ?? []).map((b) => ({
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    bill_type: b.bill_type ?? 'maintenance',
    unit_no: (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
    total_amount: Number(b.total_amount),
    paid_amount: Number(b.paid_amount),
    status: b.status,
    due_date: b.due_date,
    payments: ((b.payments as unknown as RawPayment[] | null) ?? []).map(
      (p) => ({
        id: p.id,
        amount: p.amount,
        mode: p.mode,
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
          rows.length === 0 ? 'No bills yet' : `${rows.length} bills`
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
        title={isUserRestricted ? 'Your payments' : 'Payments'}
        initialDuration={duration}
        initialStatus={status}
        description={
          isUserRestricted
            ? 'Every payment recorded against your bill(s).'
            : 'Record payments against bills and track receipts.'
        }
        accountSlug={account}
      />
    </PageBody>
  );
}
