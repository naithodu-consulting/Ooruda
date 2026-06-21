import { Zap } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ComingSoonState } from '@kit/ui/coming-soon-state';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function MescomPage({ params }: Props) {
  const { account } = await params;
  const { role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.mescom" />}
        description={<AppBreadcrumbs />}
      />

      <ComingSoonState
        icon={Zap}
        color="amber"
        title="MESCOM & meters"
        description="Upload MESCOM bills and enter sub-meter readings so electricity charges are split fairly."
        roleLabel={ROLE_LABELS[role]}
      />
    </PageBody>
  );
}
