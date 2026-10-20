import { Suspense } from 'react';

import { getTranslations } from 'next-intl/server';

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
  const {
    role,
    accountId,
    userId,
    associationId: assocId,
    associationStatus,
    accountName,
  } = await requireRole(account, PROPOPS_ROLES.slice());

  // The association id, status and name come from requireRole's single
  // request-cached lookup, so the dashboard can fire all its queries in one
  // Promise.all with no extra round trip here.
  const associationId = assocId ?? '';
  const assocName = accountName ?? '';

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
          associationStatus={associationStatus ?? ''}
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
