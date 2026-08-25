import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { AmcPageClient } from './_components/amc-page-client';
import { createAmcService } from './_lib/server/amc.service';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export const metadata = { title: 'AMC Reminder' };

export default async function AmcPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);

  const { accountId } = await requireRole(account, ['assoc_admin']);

  const client = getSupabaseServerClient();

  // Check feature flag
  const { data: assoc } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!assoc) redirect(`/home/${account}`);

  const { data: flag } = await (client as any)
    .from('association_feature_flags')
    .select('enabled')
    .eq('association_id', assoc.id)
    .eq('feature', 'amc_reminder')
    .maybeSingle();

  if (!flag?.enabled) redirect(`/home/${account}`);

  const service = createAmcService(client);
  const [stats, reminderSettings] = await Promise.all([
    service.getDashboardStats(assoc.id),
    service.getReminderSettings(assoc.id),
  ]);

  return (
    <>
      <TeamAccountLayoutPageHeader
        account={account}
        title={'Service Contracts'}
        description={
          'Manage annual maintenance contracts and renewal reminders.'
        }
      />
      <PageBody>
        <AmcPageClient
          associationId={assoc.id}
          accountSlug={account}
          stats={stats}
          reminderSettings={reminderSettings}
          defaultTab={sp.tab ?? 'dashboard'}
        />
      </PageBody>
    </>
  );
}
