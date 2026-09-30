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
import { selectVillaProperty } from '~/lib/villa/properties';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
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
  const client = getSupabaseServerClient();
  const [{ property }, superAdmin] = await Promise.all([
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

  const [codesResult, auditResult] = await Promise.all([
    client
      .from('villa_discount_codes')
      .select(
        'id, code, discount_type, discount_value, max_discount, valid_from, valid_to, min_nights, min_booking_value, max_uses, max_uses_per_guest, blackouts, note, needs_approval, status, approved_at',
      )
      .eq('property_id', property.id)
      .order('created_at', { ascending: false }),
    client
      .from('villa_discount_audit')
      .select('code_id, action, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const error = codesResult.error ?? auditResult.error;

  if (error) {
    (await getLogger()).error(
      { code: error.code },
      'villa discounts load failed',
    );
    throw new Error('Could not load the discount codes.');
  }

  const today = todayIst();
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
    history: (auditResult.data ?? [])
      .filter((a) => a.code_id === c.id)
      .slice(0, 5)
      .map((a) => ({ action: a.action, at: a.created_at })),
  }));

  return (
    <PageBody>
      {header}
      <DiscountsView
        accountId={accountId}
        propertyId={property.id}
        canEdit={role === 'villa_owner'}
        canApprove={superAdmin}
        today={today}
        codes={codes}
      />
    </PageBody>
  );
}
