import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, Building2, Ruler, User } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
import { PageBody } from '@kit/ui/page';

import { personLabel } from '~/lib/person-label';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../../_components/team-account-layout-page-header';
import { TenancyTimeline } from './_components/tenancy-timeline';

interface Props {
  params: Promise<{ account: string; unitId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { unitId } = await params;

  // Try to load the unit_no for a better browser tab title
  const client = getSupabaseServerClient();
  const { data: unit } = await client
    .from('units')
    .select('unit_no')
    .eq('id', unitId)
    .maybeSingle();

  return {
    title: unit ? `Unit ${unit.unit_no} · History` : 'Unit History',
  };
}

// removed duplicate personLabel

const areaFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export default async function UnitDetailPage({ params }: Props) {
  const { account, unitId } = await params;
  const { accountId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  // Resolve association for this account
  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  // Fetch unit — 404 if not found or not in this association
  const { data: unit } = await client
    .from('units')
    .select('id, unit_no, type, floor, area_sqft, owner_id, status')
    .eq('id', unitId)
    .eq('association_id', association.id)
    .single();

  if (!unit) {
    notFound();
  }

  // Fetch ALL tenancies for this unit (both active and ended), newest first
  const { data: tenancies } = await client
    .from('tenancies')
    .select('id, tenant_id, start_date, end_date, status')
    .eq('unit_id', unit.id)
    .order('start_date', { ascending: false });

  const allTenancies = tenancies ?? [];

  // Collect all people IDs (owner + all past/present tenants)
  const peopleIds = [
    ...new Set([
      ...(unit.owner_id ? [unit.owner_id] : []),
      ...allTenancies.map((t) => t.tenant_id),
    ]),
  ];

  let profiles: Record<
    string,
    { full_name: string | null; mobile_number: string | null }
  > = {};

  if (peopleIds.length > 0) {
    const { data: profileRows } = await client
      .from('profiles')
      .select('id, full_name, mobile_number')
      .in('id', peopleIds);

    profiles = Object.fromEntries(
      (profileRows ?? []).map((p) => [
        p.id,
        { full_name: p.full_name, mobile_number: p.mobile_number },
      ]),
    );
  }

  const ownerLabel = unit.owner_id
    ? (personLabel(profiles[unit.owner_id]) ?? 'Owner')
    : null;

  const unitsPath = `/home/${account}/units`;
  const activeTenancy = allTenancies.find((t) => t.status === 'active');
  const activeTenantLabel = activeTenancy
    ? (personLabel(profiles[activeTenancy.tenant_id]) ?? null)
    : null;

  // Build enriched tenancy rows for the timeline
  const tenancyRows = allTenancies.map((t) => ({
    id: t.id,
    tenant_id: t.tenant_id,
    tenantLabel: personLabel(profiles[t.tenant_id]) ?? t.tenant_id.slice(0, 8),
    start_date: t.start_date,
    end_date: t.end_date,
    status: t.status as 'active' | 'ended',
  }));

  const pageDescription =
    allTenancies.length === 0
      ? 'No tenancy history yet'
      : `${allTenancies.length} tenancy record${allTenancies.length !== 1 ? 's' : ''} · ${activeTenantLabel ? `Current: ${activeTenantLabel}` : 'Vacant'}`;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={`Unit ${unit.unit_no}`}
        description={pageDescription}
      />

      <div className="flex flex-col gap-5">
        {/* Back link */}
        <Link
          href={unitsPath}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to units
        </Link>

        {/* Unit summary card */}
        <div className="bg-card rounded-xl border">
          {/* Card header strip */}
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Unit details</h2>
            <Badge
              variant="outline"
              className={
                unit.status === 'Occupied' ? badgeExtras.success : undefined
              }
            >
              {unit.status}
            </Badge>
          </div>

          {/* Card body */}
          <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
            {[
              {
                label: 'Unit no.',
                value: <span className="font-semibold">{unit.unit_no}</span>,
              },
              {
                label: 'Type',
                value: (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="text-muted-foreground h-3.5 w-3.5 flex-none" />
                    {unit.type}
                  </span>
                ),
              },
              {
                label: 'Floor',
                value: <span>{unit.floor ?? '—'}</span>,
              },
              {
                label: 'Area',
                value: (
                  <span className="flex items-center gap-1.5">
                    <Ruler className="text-muted-foreground h-3.5 w-3.5 flex-none" />
                    {areaFmt.format(unit.area_sqft)} sq.ft
                  </span>
                ),
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5 px-5 py-4">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {label}
                </span>
                <span className="text-sm">{value}</span>
              </div>
            ))}
          </div>

          {/* Owner row — full width */}
          <div className="border-t px-5 py-3.5">
            <div className="flex items-center gap-2">
              <User className="text-muted-foreground h-3.5 w-3.5 flex-none" />
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Owner
              </span>
              <span className="text-sm">
                {ownerLabel ?? (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Tenancy Timeline card */}
        <div className="bg-card rounded-xl border">
          <div className="border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Tenancy history</h2>
          </div>
          <div className="px-5 py-5">
            <TenancyTimeline tenancies={tenancyRows} />
          </div>
        </div>
      </div>
    </PageBody>
  );
}
