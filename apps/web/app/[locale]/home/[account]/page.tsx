import { Suspense } from 'react';

import { getTranslations } from 'next-intl/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import { PROPOPS_ROLES, requireRole } from '~/lib/rbac';

import { AssociationDashboard } from './_components/association-dashboard';
import { TeamAccountLayoutPageHeader } from './_components/team-account-layout-page-header';

export const dynamic = 'force-dynamic';

interface TeamAccountHomePageProps {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ d?: string }>;
}

export const generateMetadata = async () => {
  const t = await getTranslations('teams');
  const title = t('home.pageTitle');

  return {
    title,
  };
};

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-80 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

async function TeamAccountHomePage({
  params,
  searchParams,
}: TeamAccountHomePageProps) {
  const [{ account }, { d }] = await Promise.all([params, searchParams]);
  const duration = d ?? 'all';
  const { role, accountId, userId } = await requireRole(
    account,
    PROPOPS_ROLES.slice(),
  );

  // Fetch the association row here so the dashboard component can fire all its
  // queries in a single Promise.all — eliminating one sequential DB round-trip.
  // This is a fast single-row indexed lookup; it does not meaningfully delay the shell.
  const client = getSupabaseServerClient();
  const { data: association } = await client
    .from('associations')
    .select('id, status, accounts(name)')
    .eq('account_id', accountId)
    .single();

  const associationId = association?.id ?? '';
  const associationStatus = association?.status ?? '';
  const assocName =
    (association?.accounts as { name?: string } | null)?.name ?? '';

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'common.routes.dashboard'} />}
        description={<AppBreadcrumbs />}
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <AssociationDashboard
          account={account}
          accountId={accountId}
          associationId={associationId}
          associationStatus={associationStatus}
          assocName={assocName}
          userId={userId}
          role={role}
          duration={duration}
        />
      </Suspense>
    </PageBody>
  );
}

export default TeamAccountHomePage;
