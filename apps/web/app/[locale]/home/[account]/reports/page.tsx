import { Activity } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function ReportsPage({ params }: Props) {
  const { account } = await params;
  // prop_owner can view reports for their own units (enforced further by RLS)
  const { role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
  ]);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.reports" />}
        description={<AppBreadcrumbs />}
      />

      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Activity className="text-muted-foreground h-12 w-12" />
        <h2 className="text-xl font-semibold">Reports</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          Financial reports are coming in Week 5. Signed in as{' '}
          <span className="text-foreground font-medium">{ROLE_LABELS[role]}</span>.
        </p>
      </div>
    </PageBody>
  );
}
