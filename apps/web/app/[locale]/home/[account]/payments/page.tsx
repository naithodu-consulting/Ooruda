import { Banknote, IndianRupee, Receipt, Wallet } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { todayInBillingZone } from '~/lib/billing-dates';
import { formatINR } from '~/lib/format-inr';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  type BillPaymentRow,
  PaymentsSection,
} from './_components/payments-section';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    status?: string;
    type?: string;
    duration?: string;
    page?: string;
  }>;
}

function getPeriodsForDuration(duration: string): string[] | null {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const formatPeriod = (y: number, m: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  };

  switch (duration) {
    case 'current_month':
      return [formatPeriod(currentYear, currentMonth)];
    case 'prev_month': {
      const d = new Date(currentYear, currentMonth - 1, 1);
      return [formatPeriod(d.getFullYear(), d.getMonth())];
    }
    case 'last_3m': {
      const list = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(currentYear, currentMonth - i, 1);
        list.push(formatPeriod(d.getFullYear(), d.getMonth()));
      }
      return list;
    }
    case 'last_6m': {
      const list = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(currentYear, currentMonth - i, 1);
        list.push(formatPeriod(d.getFullYear(), d.getMonth()));
      }
      return list;
    }
    case 'this_fy': {
      const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const list = [];
      for (let m = 0; m < 12; m++) {
        const d = new Date(startYear, 3 + m, 1);
        list.push(formatPeriod(d.getFullYear(), d.getMonth()));
      }
      return list;
    }
    case 'prev_fy': {
      const startYear = (currentMonth >= 3 ? currentYear : currentYear - 1) - 1;
      const list = [];
      for (let m = 0; m < 12; m++) {
        const d = new Date(startYear, 3 + m, 1);
        list.push(formatPeriod(d.getFullYear(), d.getMonth()));
      }
      return list;
    }
    default:
      return null;
  }
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

function toBillPaymentRow(b: {
  id: string;
  period: string;
  bill_no: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  unit_no: string;
  payments: RawPayment[] | null;
}): BillPaymentRow {
  return {
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    unit_no: b.unit_no,
    total_amount: b.total_amount,
    paid_amount: b.paid_amount,
    status: b.status,
    due_date: b.due_date,
    payments: (b.payments ?? []).map((p) => ({
      id: p.id,
      amount: p.amount,
      mode: p.mode,
      paid_by_role: p.paid_by_role,
      paid_at: p.paid_at,
      receipt_no: receiptNoOf(p),
    })),
  };
}

const BILL_WITH_PAYMENTS_SELECT =
  'id, period, bill_no, total_amount, paid_amount, status, due_date, units(unit_no), payments(id, amount, mode, paid_by_role, paid_at, receipts(receipt_no))';

export default async function PaymentsPage({ params, searchParams }: Props) {
  const { account } = await params;
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

  // 1. Parse search params
  const { status, type, duration, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const PAGE_SIZE = 25;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const today = todayInBillingZone();
  const periods = duration ? getPeriodsForDuration(duration) : null;

  // Resolve unit IDs if owner or tenant
  const unitIds: string[] = [];
  let isUserRestricted = false;

  if (role === 'prop_owner' || role === 'tenant') {
    isUserRestricted = true;
    if (role === 'prop_owner') {
      const { data: units } = await client
        .from('units')
        .select('id')
        .eq('association_id', association.id)
        .eq('owner_id', userId);
      unitIds.push(...(units ?? []).map((u) => u.id));
    } else {
      const { data: tenancies } = await client
        .from('tenancies')
        .select('unit_id, units!inner(association_id)')
        .eq('tenant_id', userId)
        .eq('status', 'active')
        .eq('units.association_id', association.id);
      unitIds.push(...(tenancies ?? []).map((t) => t.unit_id));
    }
  }

  // If owner/tenant has no units, they have 0 bills
  if (isUserRestricted && unitIds.length === 0) {
    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.payments" />}
          description="No bills yet"
        />
        <div className="flex flex-col gap-4">
          <PaymentsSection
            associationId={association.id}
            bills={[]}
            canManage={false}
            canVoid={false}
            title="Your payments"
            description="Every payment recorded against your bill(s)."
          />
        </div>
      </PageBody>
    );
  }

  // 2. Query matching bills for count and metrics
  let countQuery = client
    .from('bills')
    .select('id, total_amount, paid_amount, status, due_date', {
      count: 'exact',
    });

  if (isUserRestricted) {
    countQuery = countQuery.in('unit_id', unitIds);
  } else {
    countQuery = countQuery.eq('association_id', association.id);
  }

  if (status && status !== 'all') {
    if (status === 'paid') {
      countQuery = countQuery.eq('status', 'Paid');
    } else if (status === 'unpaid') {
      countQuery = countQuery.eq('status', 'Unpaid').gte('due_date', today);
    } else if (status === 'partial') {
      countQuery = countQuery.eq('status', 'Partial').gte('due_date', today);
    } else if (status === 'overdue') {
      countQuery = countQuery
        .in('status', ['Unpaid', 'Partial'])
        .lt('due_date', today);
    }
  }

  if (type && type !== 'all') {
    if (type === 'electricity') {
      countQuery = countQuery.ilike('bill_no', '%-ELEC-%');
    } else if (type === 'maintenance') {
      countQuery = countQuery.ilike('bill_no', '%-MANT-%');
    } else if (type === 'other_charges') {
      countQuery = countQuery.ilike('bill_no', '%-OTHR-%');
    }
  }

  if (periods) {
    countQuery = countQuery.in('period', periods);
  }

  // Set a high limit so that in-memory metrics calculation includes all bills
  countQuery = countQuery.limit(50000);

  const { data: allMatchingBills, count } = await countQuery;
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const matchedBills = allMatchingBills ?? [];
  const totalBilled = matchedBills.reduce(
    (sum, b) => sum + Number(b.total_amount),
    0,
  );
  const totalCollected = matchedBills.reduce(
    (sum, b) => sum + Number(b.paid_amount),
    0,
  );
  const totalOutstanding = totalBilled - totalCollected;

  const matchedBillIds = matchedBills.map((b) => b.id);
  const { count: paymentsCount } = matchedBillIds.length
    ? await client
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .in('bill_id', matchedBillIds)
    : { count: 0 };
  const paymentCount = paymentsCount ?? 0;

  // 3. Query paginated detailed rows
  let dataQuery = client
    .from('bills')
    .select(BILL_WITH_PAYMENTS_SELECT)
    .order('period', { ascending: false })
    .range(from, to);

  if (isUserRestricted) {
    dataQuery = dataQuery.in('unit_id', unitIds);
  } else {
    dataQuery = dataQuery.eq('association_id', association.id);
  }

  if (status && status !== 'all') {
    if (status === 'paid') {
      dataQuery = dataQuery.eq('status', 'Paid');
    } else if (status === 'unpaid') {
      dataQuery = dataQuery.eq('status', 'Unpaid').gte('due_date', today);
    } else if (status === 'partial') {
      dataQuery = dataQuery.eq('status', 'Partial').gte('due_date', today);
    } else if (status === 'overdue') {
      dataQuery = dataQuery
        .in('status', ['Unpaid', 'Partial'])
        .lt('due_date', today);
    }
  }

  if (type && type !== 'all') {
    if (type === 'electricity') {
      dataQuery = dataQuery.ilike('bill_no', '%-ELEC-%');
    } else if (type === 'maintenance') {
      dataQuery = dataQuery.ilike('bill_no', '%-MANT-%');
    } else if (type === 'other_charges') {
      dataQuery = dataQuery.ilike('bill_no', '%-OTHR-%');
    }
  }

  if (periods) {
    dataQuery = dataQuery.in('period', periods);
  }

  const { data: bills } = await dataQuery;

  const rows: BillPaymentRow[] = (bills ?? []).map((b) =>
    toBillPaymentRow({
      ...b,
      unit_no:
        (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
    }),
  );

  const displayCollectedLabel = isUserRestricted ? 'Paid' : 'collected';

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.payments" />}
        description={
          totalCount === 0
            ? 'No bills yet'
            : `${totalCount} bills · ${formatINR(totalCollected)} ${displayCollectedLabel}`
        }
      />

      <div className="flex flex-col gap-4">
        {totalCount > 0 && (
          <PaymentsMetrics
            totalBilled={totalBilled}
            totalCollected={totalCollected}
            totalOutstanding={totalOutstanding}
            paymentCount={paymentCount}
            totalCount={totalCount}
          />
        )}

        <PaymentsSection
          associationId={association.id}
          bills={rows}
          canManage={
            !isUserRestricted &&
            (role === 'assoc_admin' || role === 'billing_operator')
          }
          canVoid={!isUserRestricted && role === 'assoc_admin'}
          title={isUserRestricted ? 'Your payments' : 'Payments'}
          description={
            isUserRestricted
              ? 'Every payment recorded against your bill(s).'
              : 'Record payments against bills and track receipts.'
          }
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          accountSlug={account}
        />
      </div>
    </PageBody>
  );
}

function PaymentsMetrics(props: {
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
  paymentCount: number;
  totalCount: number;
}) {
  const {
    totalBilled,
    totalCollected,
    totalOutstanding,
    paymentCount,
    totalCount,
  } = props;

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <MetricCard
        icon={Wallet}
        label="Collected"
        value={formatINR(totalCollected)}
        sublabel={
          totalBilled === 0
            ? '0% of billed'
            : `${Math.round((totalCollected / totalBilled) * 100)}% of billed`
        }
        variant="green"
      />
      <MetricCard
        icon={IndianRupee}
        label="Outstanding"
        value={formatINR(totalOutstanding)}
        sublabel="Unpaid + partial"
        variant="amber"
      />
      <MetricCard
        icon={Receipt}
        label="Payments recorded"
        value={String(paymentCount)}
        sublabel="Across all bills"
        variant="blue"
      />
      <MetricCard
        icon={Banknote}
        label="Total billed"
        value={formatINR(totalBilled)}
        sublabel={`${totalCount} bills`}
        variant="teal"
      />
    </div>
  );
}
