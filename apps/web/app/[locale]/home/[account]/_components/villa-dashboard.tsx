import { Suspense } from 'react';

import Link from 'next/link';

import { Home, UserPlus } from 'lucide-react';

import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { VILLA_ROLES, requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from './team-account-layout-page-header';
import { VillaSiteStatus } from './villa-site-status';

/**
 * Villa workspace home. M0 ships the shell only; properties, calendar,
 * bookings and KPIs arrive in later milestones (OORUDA_VILLA_PLAN.md §12).
 */
export async function VillaDashboard({ account }: { account: string }) {
  const { role, accountId } = await requireRole(account, VILLA_ROLES, 'villa');

  const membersPath = pathsConfig.app.accountMembers.replace(
    '[account]',
    account,
  );

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'villa.dashboard.title'} />}
        description={<AppBreadcrumbs />}
      />

      <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="bg-card" data-test={'villa-dashboard-setup'}>
          <CardHeader>
            <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-full">
              <Home className="h-5 w-5" />
            </div>

            <CardTitle>
              <Trans i18nKey={'villa.dashboard.setupTitle'} />
            </CardTitle>

            <CardDescription>
              <Trans i18nKey={'villa.dashboard.setupDescription'} />
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              <Trans i18nKey={'villa.dashboard.signedInAs'} />{' '}
              <span
                className="text-foreground font-medium"
                data-test={'villa-dashboard-role'}
              >
                <Trans i18nKey={`common.roles.${role}.label`} />
              </span>
            </p>

            {role === 'villa_owner' ? (
              <Button
                className="w-full sm:w-auto"
                data-test={'villa-dashboard-invite-manager'}
                nativeButton={false}
                render={<Link href={membersPath} />}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                <Trans i18nKey={'villa.dashboard.inviteManager'} />
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <VillaSiteStatus accountId={accountId} />
        </Suspense>
      </div>
    </PageBody>
  );
}
