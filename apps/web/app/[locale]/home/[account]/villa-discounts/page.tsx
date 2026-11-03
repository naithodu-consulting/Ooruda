import { Suspense } from 'react';

import { notFound } from 'next/navigation';

import { CircleAlert } from 'lucide-react';

import { isSuperAdmin } from '@kit/admin';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import { VILLA_ROLES, requireRole } from '~/lib/rbac';
import { addDays, todayIst } from '~/lib/villa-db/dates';
import { villaDiscountsEnabled } from '~/lib/villa/discount-flag';
import { refreshMirrorForRead } from '~/lib/villa/mirror';
import {
  type VillaPropertySummary,
  selectVillaProperty,
} from '~/lib/villa/properties';

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

  return (
    <PageBody>
      {header}
      <div className="mb-4 max-w-5xl">
        <VillaSwitcher
          properties={properties.map((p) => ({ id: p.id, name: p.name }))}
          current={property.id}
        />
      </div>

      {/*
        The redemption figures come from the bookings mirror, refreshed from
        the booking site before it is read. That refresh is bounded but can
        take a couple of seconds, so the codes stream in rather than holding
        the page: the header and the villa switcher paint at once.
      */}
      <Suspense fallback={<DiscountsSkeleton />}>
        <DiscountsBody
          accountId={accountId}
          property={property}
          canEdit={role === 'villa_admin'}
          canApprove={superAdmin}
        />
      </Suspense>
    </PageBody>
  );
}

function DiscountsSkeleton() {
  return (
    <div
      className="flex max-w-5xl flex-col gap-3"
      data-test={'villa-discounts-loading'}
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

async function DiscountsBody({
  accountId,
  property,
  canEdit,
  canApprove,
}: {
  accountId: string;
  property: VillaPropertySummary;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const client = getSupabaseServerClient();

  // The redemption figures come from the mirrored bookings, so the mirror is
  // refreshed BEFORE it is read: otherwise a code used minutes ago still shows
  // "Not used yet" until the dashboard, reports or the cron sync runs.
  // Bounded: see refreshMirrorForRead.
  //
  // The codes and their audit trail do not come from the mirror, so they are
  // awaited alongside the refresh rather than after it. They are in the same
  // Promise.all so a failing refresh cannot leave them as unhandled
  // rejections.
  const [, codesResult, auditResult] = await Promise.all([
    refreshMirrorForRead(accountId, property.id),
    client
      .from('villa_discount_codes')
      .select(
        'id, code, discount_type, discount_value, max_discount, valid_from, valid_to, min_nights, min_booking_value, max_uses, max_uses_per_guest, blackouts, note, needs_approval, status, approved_at',
      )
      .eq('property_id', property.id)
      .order('created_at', { ascending: false }),
    // Only what the list's one-line summary needs: the latest entry per code.
    // The full trail — and the `terms` snapshots the History panel diffs,
    // by far the heaviest column — is loaded for one code when that panel is
    // opened, so this page never carries an audit log it may not show.
    client
      .from('villa_discount_audit')
      .select('code_id, action, created_at, actor, actor_name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  // Only this one has to wait for the refresh to have finished.
  const usageResult = await client
    .from('villa_bookings_mirror')
    .select('discount_code, discount_amount, guest_name, check_in')
    .eq('property_id', property.id)
    .not('discount_code', 'is', null)
    .in('status', ['confirmed', 'completed']);

  const error = codesResult.error ?? auditResult.error ?? usageResult.error;

  if (error) {
    (await getLogger()).error(
      { code: error.code },
      'villa discounts load failed',
    );
    throw new Error('Could not load the discount codes.');
  }

  // The actor's name is denormalised onto each audit row at write time, so
  // history stays true after a member leaves. Rows written before that (or by
  // someone whose profile had no name yet) fall back to a lookup.
  const actorIds = [
    ...new Set(
      (auditResult.data ?? [])
        .filter((a) => a.actor && !a.actor_name)
        .map((a) => a.actor) as string[],
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

  // Newest first, so the first row found for a code is its latest action.
  const lastActionByCode = new Map<
    string,
    { action: string; at: string; actorName: string | null }
  >();
  for (const a of auditResult.data ?? []) {
    if (lastActionByCode.has(a.code_id)) continue;
    lastActionByCode.set(a.code_id, {
      action: a.action,
      at: a.created_at,
      actorName:
        a.actor_name ?? (a.actor ? (actorNames.get(a.actor) ?? null) : null),
    });
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
    lastAction: lastActionByCode.get(c.id) ?? null,
    usage: usageByCode.get(c.code) ?? null,
  }));

  return (
    <DiscountsView
      accountId={accountId}
      propertyId={property.id}
      canEdit={canEdit}
      canApprove={canApprove}
      today={today}
      codes={codes}
    />
  );
}
