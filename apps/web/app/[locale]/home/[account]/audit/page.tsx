import { History } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ComingSoonState } from '@kit/ui/coming-soon-state';
import { PageBody } from '@kit/ui/page';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function AuditPage({ params }: Props) {
  const { account } = await params;
  const { role } = await requireRole(account, ['assoc_admin']);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title="Audit log"
        description={<AppBreadcrumbs />}
      />

      <ComingSoonState
        icon={History}
        color="purple"
        title="Audit log"
        description="A full record of every billing, payment, and settings action taken across the association."
        week={5}
        roleLabel={ROLE_LABELS[role]}
      />
    </PageBody>
  );
}
