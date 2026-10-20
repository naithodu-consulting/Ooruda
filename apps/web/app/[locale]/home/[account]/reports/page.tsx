import { Suspense } from 'react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { ReportsClientPage } from './_components/reports-client-page';
// Imported directly (not re-exported through the client page) so the Suspense
// fallback does not depend on that large client module.
import { ReportsSkeleton } from './_components/reports-skeleton';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ params }: Props) {
  const { account } = await params;

  // Reports is admin-only - prop_owner and tenant are not permitted.
  const { associationId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  const association = associationId ? { id: associationId } : null;

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  // Fetch units list once server-side for the unit multi-select filter.
  // RLS ensures only units belonging to this association are returned.
  const { data: unitsData } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', association.id)
    .order('unit_no');

  const units = (unitsData ?? []).map((u) => ({
    id: u.id,
    unit_no: u.unit_no,
  }));

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.reports" />}
        description="Association financial analytics"
      />
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsClientPage
          account={account}
          associationId={association.id}
          units={units}
        />
      </Suspense>
    </PageBody>
  );
}
