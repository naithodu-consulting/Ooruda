import { Building2 } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { AddUnitDialog } from './_components/add-unit-dialog';
import {
  type MemberOption,
  type OwnerInfo,
  type UnitRow,
  UnitsTable,
} from './_components/units-table';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Units & Owners' };

export default async function UnitsPage({ params }: Props) {
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
    .select('id, unit_no, type, floor, area_sqft, owner_id, status')
    .eq('association_id', association.id)
    .order('unit_no');

  const unitRows = (units ?? []) as UnitRow[];
  const unitIds = unitRows.map((u) => u.id);

  const { data: tenancies } = unitIds.length
    ? await client
        .from('tenancies')
        .select('id, unit_id, tenant_id, start_date')
        .in('unit_id', unitIds)
        .eq('status', 'active')
    : { data: [] };

  const activeTenancies = tenancies ?? [];
  const tenancyByUnit: Record<string, (typeof activeTenancies)[number]> =
    Object.fromEntries(activeTenancies.map((t) => [t.unit_id, t]));

  // Resolve owner/tenant names in one query. `units.owner_id` and
  // `tenancies.tenant_id` reference auth.users, which has no PostgREST
  // relationship to `profiles`, so we can't embed it — fetch the co-member
  // profiles (readable via profiles_read_account_members) and map by id.
  const peopleIds = [
    ...new Set([
      ...unitRows.map((u) => u.owner_id).filter(Boolean),
      ...activeTenancies.map((t) => t.tenant_id),
    ]),
  ] as string[];

  let people: Record<string, OwnerInfo> = {};

  if (peopleIds.length > 0) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, full_name, mobile_number')
      .in('id', peopleIds);

    people = Object.fromEntries(
      (profiles ?? []).map((p) => [
        p.id,
        { full_name: p.full_name, mobile_number: p.mobile_number },
      ]),
    );
  }

  const canManage = role === 'assoc_admin';

  let eligibleOwners: MemberOption[] = [];
  let eligibleTenants: MemberOption[] = [];

  if (canManage) {
    const { data: members } = await client
      .from('accounts_memberships')
      .select('user_id, account_role')
      .eq('account_id', accountId)
      .in('account_role', ['prop_owner', 'tenant']);

    const memberIds = [...new Set((members ?? []).map((m) => m.user_id))];

    let memberProfiles: Record<string, OwnerInfo> = {};

    if (memberIds.length > 0) {
      const { data: profiles } = await client
        .from('profiles')
        .select('id, full_name, mobile_number')
        .in('id', memberIds);

      memberProfiles = Object.fromEntries(
        (profiles ?? []).map((p) => [
          p.id,
          { full_name: p.full_name, mobile_number: p.mobile_number },
        ]),
      );
    }

    const toOption = (userId: string): MemberOption => {
      const info = memberProfiles[userId];

      return {
        id: userId,
        label: info?.full_name?.trim() || info?.mobile_number || userId,
      };
    };

    eligibleOwners = (members ?? [])
      .filter((m) => m.account_role === 'prop_owner')
      .map((m) => toOption(m.user_id));

    eligibleTenants = (members ?? [])
      .filter((m) => m.account_role === 'tenant')
      .map((m) => toOption(m.user_id));
  }

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.units" />}
        description={<AppBreadcrumbs />}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {unitRows.length === 0
              ? 'No units yet'
              : `${unitRows.length} ${unitRows.length === 1 ? 'unit' : 'units'}`}
          </p>

          {canManage ? <AddUnitDialog associationId={association.id} /> : null}
        </div>

        {unitRows.length > 0 ? (
          <UnitsTable
            units={unitRows}
            people={people}
            tenancyByUnit={tenancyByUnit}
            canManage={canManage}
            associationId={association.id}
            eligibleOwners={eligibleOwners}
            eligibleTenants={eligibleTenants}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
            <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-2xl">
              <Building2 className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="text-muted-foreground max-w-sm text-sm">
              {canManage
                ? 'Add your first shop, office, or warehouse to start tracking owners and billing.'
                : 'No units have been added to this association yet.'}
            </p>
          </div>
        )}
      </div>
    </PageBody>
  );
}
