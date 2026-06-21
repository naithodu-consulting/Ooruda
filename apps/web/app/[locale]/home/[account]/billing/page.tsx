import { FileText } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ComingSoonState } from '@kit/ui/coming-soon-state';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function BillingPage({ params }: Props) {
  const { account } = await params;
  const { role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.billing" />}
        description={<AppBreadcrumbs />}
      />

      <ComingSoonState
        icon={FileText}
        color="green"
        title="Billing"
        description="Raise maintenance and electricity bills, bill every unit at once and keep track of what has been collected."
        roleLabel={ROLE_LABELS[role]}
      />
    </PageBody>
  );
}
