import { Suspense } from 'react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  ReportsClientPage,
  ReportsSkeleton,
} from './_components/reports-client-page';
import {
  MyDuesCard,
  type OutstandingDueRow,
} from './_components/reports-sections';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ params }: Props) {
  const { account } = await params;

  const { accountId, role, userId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
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

  // ── prop_owner: personal dues — kept server-side (no filter state needed) ──
  if (role === 'prop_owner') {
    const { data: ownedUnits } = await client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', association.id)
      .eq('owner_id', userId);

    const unitIds = (ownedUnits ?? []).map((u) => u.id);
    const unitNoById = new Map(
      (ownedUnits ?? []).map((u) => [u.id, u.unit_no]),
    );

    const { data: bills } =
      unitIds.length > 0
        ? await client
            .from('bills')
            .select(
              'id, period, bill_no, total_amount, paid_amount, status, due_date, unit_id',
            )
            .in('unit_id', unitIds)
            .order('period', { ascending: false })
        : { data: [] };

    const myDues: OutstandingDueRow[] = (bills ?? []).map((b) => ({
      id: b.id,
      period: b.period,
      bill_no: b.bill_no,
      unit_no: unitNoById.get(b.unit_id) ?? '—',
      total_amount: b.total_amount,
      paid_amount: b.paid_amount,
      status: b.status,
      due_date: b.due_date,
    }));

    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.reports" />}
          description={
            myDues.length === 0
              ? 'No bills yet'
              : `${myDues.length} bill${myDues.length !== 1 ? 's' : ''} across your unit(s)`
          }
        />
        <MyDuesCard bills={myDues} />
      </PageBody>
    );
  }

  // ── admin / billing_operator: all data fetched client-side ─────────────────
  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.reports" />}
        description="Association financial analytics"
      />
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsClientPage account={account} associationId={association.id} />
      </Suspense>
    </PageBody>
  );
}
