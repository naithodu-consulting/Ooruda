import { CreditCard } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { ROLE_LABELS, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function PaymentsPage({ params }: Props) {
  const { account } = await params;
  const { role } = await requireRole(account, ['assoc_admin', 'billing_operator']);

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.payments" />}
        description={<AppBreadcrumbs />}
      />

      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <CreditCard className="text-muted-foreground h-12 w-12" />
        <h2 className="text-xl font-semibold">Payments</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          Payment ledger is coming in Week 3. Signed in as{' '}
          <span className="text-foreground font-medium">{ROLE_LABELS[role]}</span>.
        </p>
      </div>
    </PageBody>
  );
}
