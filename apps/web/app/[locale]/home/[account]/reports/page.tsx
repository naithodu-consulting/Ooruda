import { Activity } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ComingSoonState } from '@kit/ui/coming-soon-state';
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

      <ComingSoonState
        icon={Activity}
        color="purple"
        title="Reports"
        description="Download collection summaries, outstanding dues, and electricity usage reports as PDF or Excel."
        roleLabel={ROLE_LABELS[role]}
      />
    </PageBody>
  );
}
