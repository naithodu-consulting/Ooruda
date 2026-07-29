import { Building2, DoorClosed, DoorOpen, Ruler } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { displayBillStatus } from '~/lib/bill-status';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { AddUnitDialog } from './_components/add-unit-dialog';
import { ImportUnitsDialog } from './_components/import-units-dialog';
import {
  type MemberOption,
  type OwnerInfo,
  type UnitRow,
  UnitsTable,
} from './_components/units-table';

interface Props {
  params: Promise<{ account: string }>;
}

const areaFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

export const metadata = { title: 'Units & Owners' };

export default async function UnitsPage({ params }: Props) {
  const { account } = await params;
  const { accountId, role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();
  const { data: isSuperAdmin } = await client.rpc('is_super_admin');

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
    .select(
      'id, unit_no, type, floor, area_sqft, door_no, owner_id, owner_is_company, owner_company_name, owner_company_address, owner_company_gstin, bill_to, status',
    )
    .eq('association_id', association.id)
    .neq('type', 'Common Area')
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

  const { data: openBills } = unitIds.length
    ? await client
        .from('bills')
        .select(
          'unit_id, status, due_date, total_amount, paid_amount, advance_applied',
        )
        .in('unit_id', unitIds)
        .in('status', ['Unpaid', 'Partial', 'Overdue'])
    : { data: [] };

  const overdueUnitIds = new Set(
    (openBills ?? [])
      .filter((bill) => displayBillStatus(bill) === 'Overdue')
      .map((bill) => bill.unit_id),
  );

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
        label:
          info?.full_name?.trim() ||
          info?.mobile_number ||
          `Member ${userId.slice(0, 8)}`,
      };
    };

    eligibleOwners = (members ?? [])
      .filter((m) => m.account_role === 'prop_owner')
      .map((m) => toOption(m.user_id));

    eligibleTenants = (members ?? [])
      .filter((m) => m.account_role === 'tenant')
      .map((m) => toOption(m.user_id));
  }

  const occupiedCount = unitRows.filter((u) => u.status !== 'Vacant').length;
  const vacantCount = unitRows.length - occupiedCount;
  const totalAreaSqft = unitRows.reduce((sum, u) => sum + u.area_sqft, 0);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.units" />}
        description={
          unitRows.length === 0
            ? 'No units yet'
            : `${unitRows.length} units · ${occupiedCount} occupied · ${vacantCount} vacant`
        }
      />

      <div className="flex flex-col gap-4">
        {unitRows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <MetricCard
              icon={DoorClosed}
              label="Total units"
              value={String(unitRows.length)}
              sublabel="All units"
              variant="blue"
            />
            <MetricCard
              icon={DoorOpen}
              label="Occupied"
              value={String(occupiedCount)}
              sublabel={`${unitRows.length === 0 ? 0 : Math.round((occupiedCount / unitRows.length) * 100)}% occupancy`}
              variant="green"
            />
            <MetricCard
              icon={Building2}
              label="Vacant"
              value={String(vacantCount)}
              sublabel="Available now"
              variant="amber"
            />
            <MetricCard
              icon={Ruler}
              label="Total area"
              value={areaFormatter.format(totalAreaSqft)}
              sublabel="Sq.ft"
              variant="teal"
            />
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-4">
          {canManage ? (
            <>
              <ImportUnitsDialog associationId={association.id} />
              <AddUnitDialog associationId={association.id} />
            </>
          ) : null}
        </div>

        {unitRows.length > 0 ? (
          <UnitsTable
            units={unitRows}
            people={people}
            tenancyByUnit={tenancyByUnit}
            canManage={canManage}
            isSuperAdmin={!!isSuperAdmin}
            associationId={association.id}
            eligibleOwners={eligibleOwners}
            eligibleTenants={eligibleTenants}
            overdueUnitIds={[...overdueUnitIds]}
            accountSlug={account}
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
