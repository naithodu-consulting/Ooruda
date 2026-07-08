import { getTranslations } from 'next-intl/server';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
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

async function TeamAccountHomePage({
  params,
  searchParams,
}: TeamAccountHomePageProps) {
  const [{ account }, { d }] = await Promise.all([params, searchParams]);
  const duration = d ?? 'current_month';
  const { role, accountId, userId } = await requireRole(
    account,
    PROPOPS_ROLES.slice(),
  );

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'common.routes.dashboard'} />}
        description={<AppBreadcrumbs />}
      />

      <AssociationDashboard
        account={account}
        accountId={accountId}
        userId={userId}
        role={role}
        duration={duration}
      />
    </PageBody>
  );
}

export default TeamAccountHomePage;
