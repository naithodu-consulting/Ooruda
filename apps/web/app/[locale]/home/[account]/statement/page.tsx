import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  type StatementEntry,
  StatementTable,
} from './_components/statement-table';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Statement' };

export default async function StatementPage({ params }: Props) {
  const { account } = await params;
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

  // Deduplicate (a user could theoretically own and rent the same unit).
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

  // Fetch all cash ledger entries for these units, oldest first for balance calc.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawEntries } = await (client as any)
    .from('cash_ledger')
    .select(
      'id, unit_id, entry_type, bill_type, amount, direction, paid_by_name, entry_date, notes, created_at',
    )
    .in('unit_id', unitIds)
    .eq('association_id', association.id)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  const sorted = (
    rawEntries as {
      id: string;
      unit_id: string;
      entry_type: string;
      bill_type: string;
      amount: number;
      direction: string;
      paid_by_name: string;
      entry_date: string;
      notes: string | null;
      created_at: string;
    }[]
  ) ?? [];

  // Compute running balance per unit (oldest → newest), then reverse for display.
  const perUnitBalance = new Map<string, number>();
  const entriesWithBalance: StatementEntry[] = sorted.map((e) => {
    const prev = perUnitBalance.get(e.unit_id) ?? 0;
    const delta = e.direction === 'credit' ? Number(e.amount) : -Number(e.amount);
    const next = prev + delta;
    perUnitBalance.set(e.unit_id, next);
    return {
      id: e.id,
      unit_id: e.unit_id,
      unit_no: unitNoMap.get(e.unit_id) ?? '?',
      entry_type: e.entry_type as StatementEntry['entry_type'],
      bill_type: e.bill_type,
      amount: Number(e.amount),
      direction: e.direction as 'debit' | 'credit',
      paid_by_name: e.paid_by_name,
      entry_date: e.entry_date,
      notes: e.notes,
      created_at: e.created_at,
      runningBalance: next,
    };
  });

  // Reverse for newest-first display.
  entriesWithBalance.reverse();

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.statement" />}
        description="Your unit's cash ledger — advances, dues, and payments in chronological order."
      />
      <StatementTable units={allUnits} entries={entriesWithBalance} />
    </PageBody>
  );
}
