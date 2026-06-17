import { Bell } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ComingSoonState } from '@kit/ui/coming-soon-state';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function NotificationsPage({ params }: Props) {
  const { account } = await params;
  const { role } = await requireRole(account, ['assoc_admin', 'billing_operator']);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.notifications" />}
        description={<AppBreadcrumbs />}
      />

      <ComingSoonState
        icon={Bell}
        color="blue"
        title="Notifications"
        description="Send SMS and email reminders for bills, dues, and overdue payments to owners and tenants."
        week={4}
        roleLabel={ROLE_LABELS[role]}
      />
    </PageBody>
  );
}
