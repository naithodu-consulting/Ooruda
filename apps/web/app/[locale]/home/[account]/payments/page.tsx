import { CreditCard } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { ComingSoonState } from '@kit/ui/coming-soon-state';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function PaymentsPage({ params }: Props) {
  const { account } = await params;
  const { role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
    'tenant',
  ]);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.payments" />}
        description={<AppBreadcrumbs />}
      />

      <ComingSoonState
        icon={CreditCard}
        color="green"
        title="Payments"
        description="Record card, UPI, bank payments and match receipts to the right bills with Razorpay built in."
        roleLabel={ROLE_LABELS[role]}
      />
    </PageBody>
  );
}
