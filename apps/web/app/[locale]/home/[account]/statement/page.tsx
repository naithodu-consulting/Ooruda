import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { StatementTable } from './_components/statement-table';
import { buildStatementEntries } from './_lib/server/statement.service';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    fy?: string;
    type?: string;
    unit?: string;
    from?: string;
    to?: string;
  }>;
}

export const metadata = { title: 'Statement' };

export default async function StatementPage({ params, searchParams }: Props) {
  const { account } = await params;
  const {
    fy: initialFy,
    type: initialType,
    unit: initialUnit,
    from: initialFrom,
    to: initialTo,
  } = await searchParams;
  const { accountId, userId } = await requireRole(account, [
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
    throw new Error('Unable to load association for this account.');
  }

  // Resolve accessible units (same logic as payments page).
  const [{ data: ownedUnits }, { data: tenancies }] = await Promise.all([
    client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', association.id)
      .eq('owner_id', userId)
      .order('unit_no'),
    client
      .from('tenancies')
      .select('id, unit_id, units!inner(id, unit_no, association_id)')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .eq('units.association_id', association.id),
  ]);

  const ownedUnitList = (ownedUnits ?? []) as { id: string; unit_no: string }[];
  const rentedUnitList = (tenancies ?? []).map(
    (t) => t.units as unknown as { id: string; unit_no: string },
  );

  const seenIds = new Set<string>();
  const allUnits: { id: string; unit_no: string }[] = [];
  for (const u of [...ownedUnitList, ...rentedUnitList]) {
    if (!seenIds.has(u.id)) {
      seenIds.add(u.id);
      allUnits.push(u);
    }
  }

  if (allUnits.length === 0) {
    return (
      <PageBody>
        <TeamAccountLayoutPageHeader
          account={account}
          title={<Trans i18nKey="association.nav.statement" />}
          description="No units assigned to your account yet."
        />
      </PageBody>
    );
  }

  const unitIds = allUnits.map((u) => u.id);
  const unitNoMap = new Map(allUnits.map((u) => [u.id, u.unit_no]));

  const entries = await buildStatementEntries({
    client,
    associationId: association.id,
    unitIds,
    unitNoMap,
  });

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.statement" />}
        description="Your unit's statement. Most recent transactions first."
      />
      <StatementTable
        account={account}
        units={allUnits}
        entries={entries}
        initialFy={initialFy}
        initialType={initialType}
        initialUnit={initialUnit}
        initialFrom={initialFrom}
        initialTo={initialTo}
      />
    </PageBody>
  );
}
