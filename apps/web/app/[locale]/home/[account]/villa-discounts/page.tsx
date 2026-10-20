import { notFound } from 'next/navigation';

import { CircleAlert } from 'lucide-react';

import { isSuperAdmin } from '@kit/admin';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { villaDiscountsEnabled } from '~/lib/villa/discount-flag';
import { refreshMirrorForRead } from '~/lib/villa/mirror';
import { selectVillaProperty } from '~/lib/villa/properties';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { VillaSwitcher } from '../_components/villa-switcher';
import { type DiscountRow, DiscountsView } from './_components/discounts-view';

export const metadata = { title: 'Discount codes' };

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ property?: string }>;
}

export default async function VillaDiscountsPage({
  params,
  searchParams,
}: Props) {
  if (!villaDiscountsEnabled()) notFound();

  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const { role, accountId } = await requireRole(account, VILLA_ROLES, 'villa');

  // Managers have no access to discount codes (also hidden from their nav). A
  // platform super-admin acts as villa_admin, so is unaffected.
  if (role !== 'villa_admin') notFound();
  const client = getSupabaseServerClient();
  const [{ properties, property }, superAdmin] = await Promise.all([
    selectVillaProperty(accountId, sp.property),
    isSuperAdmin(client),
  ]);

  const header = (
    <TeamAccountLayoutPageHeader
      account={account}
      title={<Trans i18nKey={'villa.nav.discounts'} />}
      description={<AppBreadcrumbs />}
    />
  );

  if (!property) {
    return (
      <PageBody>
        {header}
        <Alert data-test={'villa-discounts-no-property'}>
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>No villa set up yet</AlertTitle>
          <AlertDescription>Codes are set per villa.</AlertDescription>
        </Alert>
      </PageBody>
    );
  }

  // The redemption figures below come from the mirrored bookings, so refresh
  // the copy BEFORE reading it: otherwise a code used minutes ago still shows
  // "Not used yet" until the dashboard, reports or the cron sync runs.
  // Bounded: see refreshMirrorForRead.
  await refreshMirrorForRead(accountId, property.id);

  const [codesResult, auditResult, usageResult] = await Promise.all([
    client
      .from('villa_discount_codes')
      .select(
        'id, code, discount_type, discount_value, max_discount, valid_from, valid_to, min_nights, min_booking_value, max_uses, max_uses_per_guest, blackouts, note, needs_approval, status, approved_at',
      )
      .eq('property_id', property.id)
      .order('created_at', { ascending: false }),
    client
      .from('villa_discount_audit')
      .select('code_id, action, created_at, actor')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(500),
    client
      .from('villa_bookings_mirror')
      .select('discount_code, discount_amount, guest_name, check_in')
      .eq('property_id', property.id)
      .not('discount_code', 'is', null)
      .in('status', ['confirmed', 'completed']),
  ]);

  const error = codesResult.error ?? auditResult.error ?? usageResult.error;

  if (error) {
    (await getLogger()).error(
      { code: error.code },
      'villa discounts load failed',
    );
    throw new Error('Could not load the discount codes.');
  }

  // Resolve actor names for the audit trail.
  const actorIds = [
    ...new Set(
      (auditResult.data ?? []).map((a) => a.actor).filter(Boolean) as string[],
    ),
  ];
  const actorNames = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds);
    for (const p of profiles ?? []) {
      if (p.full_name) actorNames.set(p.id, p.full_name);
    }
  }

  const today = todayIst();

  // Build a per-code usage map from mirror rows that have a discount_code.
  type UsageStat = {
    timesUsed: number;
    totalDiscount: number;
    lastUsedAt: string | null;
    lastGuestName: string | null;
  };
  const usageByCode = new Map<string, UsageStat>();
  for (const row of usageResult.data ?? []) {
    const code = row.discount_code!;
    const prev = usageByCode.get(code) ?? {
      timesUsed: 0,
      totalDiscount: 0,
      lastUsedAt: null,
      lastGuestName: null,
    };
    const checkIn = row.check_in;
    usageByCode.set(code, {
      timesUsed: prev.timesUsed + 1,
      totalDiscount: prev.totalDiscount + Number(row.discount_amount ?? 0),
      lastUsedAt:
        !prev.lastUsedAt || checkIn > prev.lastUsedAt
          ? checkIn
          : prev.lastUsedAt,
      lastGuestName:
        !prev.lastUsedAt || checkIn > prev.lastUsedAt
          ? row.guest_name
          : prev.lastGuestName,
    });
  }

  const codes: DiscountRow[] = (codesResult.data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    discountType: c.discount_type as DiscountRow['discountType'],
    discountValue: Number(c.discount_value),
    maxDiscount: c.max_discount === null ? null : Number(c.max_discount),
    validFrom: c.valid_from,
    validTo: c.valid_to,
    minNights: c.min_nights,
    minBookingValue: Number(c.min_booking_value),
    maxUses: c.max_uses,
    maxUsesPerGuest: c.max_uses_per_guest,
    blackouts: ((c.blackouts as { start: string; end: string }[]) ?? []).map(
      (b) => ({
        start: b.start,
        lastNight: addDays(b.end, -1),
      }),
    ),
    note: c.note,
    needsApproval: Boolean(c.needs_approval),
    status: c.status as DiscountRow['status'],
    expired: c.valid_to < today,
    history: (() => {
      const all = (auditResult.data ?? [])
        .filter((a) => a.code_id === c.id)
        .map((a) => ({
          action: a.action,
          at: a.created_at,
          actorName: a.actor ? (actorNames.get(a.actor) ?? null) : null,
        }));
      const created = all.findLast((a) => a.action === 'created');
      const latest = all[0];
      if (!latest) return [];
      if (!created || latest.action === 'created') return [latest];
      return [latest, created];
    })(),
    usage: usageByCode.get(c.code) ?? null,
  }));

  return (
    <PageBody>
      {header}
      <div className="mb-4 max-w-5xl">
        <VillaSwitcher
          properties={properties.map((p) => ({ id: p.id, name: p.name }))}
          current={property.id}
        />
      </div>

      <DiscountsView
        accountId={accountId}
        propertyId={property.id}
        canEdit={role === 'villa_admin'}
        canApprove={superAdmin}
        today={today}
        codes={codes}
      />
    </PageBody>
  );
}
