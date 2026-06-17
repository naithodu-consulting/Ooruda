import { Building2 } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ComingSoonState } from '@kit/ui/coming-soon-state';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function UnitsPage({ params }: Props) {
  const { account } = await params;
  const { role } = await requireRole(account, ['assoc_admin', 'billing_operator']);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.units" />}
        description={<AppBreadcrumbs />}
      />

      <ComingSoonState
        icon={Building2}
        color="blue"
        title="Units & shops"
        description="Manage shops, offices, and warehouses across your property, with owner and tenant details."
        week={2}
        roleLabel={ROLE_LABELS[role]}
      />
    </PageBody>
  );
}
