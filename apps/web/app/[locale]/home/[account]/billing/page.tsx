import { FileText, IndianRupee, TrendingUp, TriangleAlert } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { displayBillStatus } from '~/lib/bill-status';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatINR } from '~/lib/format-inr';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { BillsSection, type BillRow } from './_components/bills-section';

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

export const metadata = { title: 'Billing' };

export default async function BillingPage({ params, searchParams }: Props) {
  const { account } = await params;
  const { accountId, role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
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

  const { data: units } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', association.id)
    .order('unit_no');

  const { data: otherChargesCT } = await client
    .from('charge_types')
    .select('is_active')
    .eq('association_id', association.id)
    .eq('key', 'other_charges')
    .maybeSingle();

  const isOtherChargesActive = otherChargesCT?.is_active ?? false;

  const unitRows = (units ?? []) as { id: string; unit_no: string }[];
  const unitNoById = new Map(unitRows.map((u) => [u.id, u.unit_no]));

  // Generate period options: current month + 6 previous months (YYYY-MM)
  const periodOptions: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  const { data: pendingChargesRaw } = await client
    .from('pending_other_charges')
    .select('id, unit_id, period, label, amount, split_mode')
    .eq('association_id', association.id)
    .order('created_at', { ascending: false });

  const pendingCharges = (pendingChargesRaw ?? []).map((pc) => ({
    ...pc,
    unit_no: pc.unit_id ? (unitNoById.get(pc.unit_id) ?? null) : null,
  }));

  // 1. Parse search params
  const { status, type, duration, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const PAGE_SIZE = 25;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // 2. Build base filters for query
  const today = todayInBillingZone();
  const periods = duration ? getPeriodsForDuration(duration) : null;

  let countQuery = client
    .from('bills')
    .select('id, total_amount, paid_amount, status, due_date', {
      count: 'exact',
    })
    .eq('association_id', association.id);

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

  // Calculate metrics over all matched records
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
  const overdueCount = matchedBills.filter(
    (b) => displayBillStatus(b) === 'Overdue',
  ).length;

  // 3. Fetch detailed paginated rows
  let dataQuery = client
    .from('bills')
    .select(
      'id, period, bill_no, total_amount, paid_amount, status, due_date, units(unit_no), bill_line_items(id, description, payer, gst_applicable, amount)',
    )
    .eq('association_id', association.id)
    .order('period', { ascending: false })
    .order('bill_no')
    .range(from, to);

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

  const billRows: BillRow[] = (bills ?? []).map((b) => ({
    id: b.id,
    period: b.period,
    bill_no: b.bill_no,
    total_amount: Number(b.total_amount),
    paid_amount: Number(b.paid_amount),
    status: b.status,
    due_date: b.due_date,
    unit_no: (b.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
    lineItems: b.bill_line_items,
  }));

  const canManage = role === 'assoc_admin' || role === 'billing_operator';
  const canDelete = role === 'assoc_admin';

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.billing" />}
        description={
          totalCount === 0
            ? 'No bills yet'
            : `${totalCount} bills · ${formatINR(totalCollected)} collected · ${formatINR(totalOutstanding)} outstanding`
        }
      />

      <div className="flex flex-col gap-4">
        {totalCount > 0 ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <MetricCard
              icon={FileText}
              label="Total billed"
              value={formatINR(totalBilled)}
              sublabel={`${totalCount} bills`}
              variant="blue"
            />
            <MetricCard
              icon={TrendingUp}
              label="Collected"
              value={formatINR(totalCollected)}
              sublabel={
                totalBilled === 0
                  ? '0% collected'
                  : `${Math.round((totalCollected / totalBilled) * 100)}% collected`
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
              icon={TriangleAlert}
              label="Overdue"
              value={String(overdueCount)}
              sublabel="Bills past due"
              variant="red"
            />
          </div>
        ) : null}

        <BillsSection
          associationId={association.id}
          bills={billRows}
          canManage={canManage}
          canDelete={canDelete}
          units={unitRows}
          pendingCharges={pendingCharges}
          periodOptions={periodOptions}
          isOtherChargesActive={isOtherChargesActive}
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          accountSlug={account}
        />
      </div>
    </PageBody>
  );
}
