import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { VillaSettingsClient } from './_components/villa-settings-client';
import { loadSiteSettings } from './_lib/server/villa-settings.loader';
import type { SiteState } from './_lib/types';

export const metadata = { title: 'Villa Settings' };

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ tab?: string; property?: string }>;
}

// A failed query must not masquerade as "nothing set up yet".
function rows<T>(result: {
  data: T[] | null;
  error: { message: string } | null;
}): T[] {
  if (result.error)
    throw new Error(`villa settings load failed: ${result.error.message}`);
  return result.data ?? [];
}

export default async function VillaSettingsPage({
  params,
  searchParams,
}: Props) {
  const [{ account }, { tab, property }] = await Promise.all([
    params,
    searchParams,
  ]);

  const { role, accountId } = await requireRole(account, VILLA_ROLES, 'villa');
  const client = getSupabaseServerClient();

  const properties = rows(
    await client
      .from('villa_properties')
      .select(
        'id, name, booking_code_prefix, status, ota_buffer_nights, retention_days, whatsapp_number, legal_name, gstin',
      )
      .eq('account_id', accountId)
      .order('created_at'),
  );

  const selected =
    properties.find((p) => p.id === property) ?? properties[0] ?? null;

  if (property && selected?.id !== property) {
    redirect(
      pathsConfig.app.accountVillaSettings.replace('[account]', account),
    );
  }

  const [site, settings] = selected
    ? await Promise.all([
        loadSiteSettings(accountId, selected.id),
        client
          .from('villa_account_settings')
          .select(
            'managers_can_cancel, pre_arrival_email, thank_you_email, booking_cutoff_date',
          )
          .eq('account_id', accountId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error)
              throw new Error(`villa settings load failed: ${error.message}`);
            return data;
          }),
      ])
    : [{ status: 'not_configured' } as SiteState, null];

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.nav.settings'} />}
        description={<AppBreadcrumbs />}
      />

      <VillaSettingsClient
        account={account}
        accountId={accountId}
        canEdit={role === 'villa_admin'}
        initialTab={tab}
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
        property={
          selected
            ? {
                id: selected.id,
                name: selected.name,
                otaBufferNights: selected.ota_buffer_nights,
                whatsappNumber: selected.whatsapp_number,
                legalName: selected.legal_name,
                gstin: selected.gstin,
                retentionDays: selected.retention_days,
              }
            : null
        }
        site={site}
        managersCanCancel={settings?.managers_can_cancel ?? false}
        preArrivalEmail={settings?.pre_arrival_email ?? false}
        thankYouEmail={settings?.thank_you_email ?? false}
        bookingCutoffDate={settings?.booking_cutoff_date ?? null}
      />
    </PageBody>
  );
}
