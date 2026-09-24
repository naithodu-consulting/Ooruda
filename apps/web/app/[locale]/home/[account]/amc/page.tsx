import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { loadAssociationFeatures } from '../_lib/server/association-features.loader';
import { AmcPageClient } from './_components/amc-page-client';
import { createAmcService } from './_lib/server/amc.service';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ tab?: string; status?: string }>;
}

export const metadata = { title: 'AMC Reminder' };

export default async function AmcPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);

  const { associationId } = await requireRole(account, ['assoc_admin']);

  const client = getSupabaseServerClient();

  // Check feature flag
  const assoc = associationId ? { id: associationId } : null;

  if (!assoc) redirect(`/home/${account}`);

  // Feature gate (request-cached, already loaded by the layout)
  const features = await loadAssociationFeatures(account);

  if (!features.isEnabled('amc_reminder')) redirect(`/home/${account}`);

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
          // Remount when the URL's tab/status change on the same page, so
          // links such as "View Expired" switch tab and apply the filter.
          key={`${sp.tab ?? ''}|${sp.status ?? ''}`}
          associationId={assoc.id}
          accountSlug={account}
          stats={stats}
          reminderSettings={reminderSettings}
          defaultTab={sp.tab ?? 'dashboard'}
          defaultStatus={sp.status ?? ''}
        />
      </PageBody>
    </>
  );
}
