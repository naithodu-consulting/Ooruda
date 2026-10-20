import Link from 'next/link';

import { Calendar, Home, Receipt, UserPlus } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';

/**
 * "Your villa workspace" card: role-aware welcome, quick links and the
 * signed-in role. Shown on the Bookings page (it used to live on the
 * dashboard). "New booking" is the Bookings page header action, so it is not
 * repeated here.
 */
export function VillaWorkspaceCard({
  account,
  role,
}: {
  account: string;
  role: string;
}) {
  const membersPath = pathsConfig.app.accountMembers.replace(
    '[account]',
    account,
  );
  const calendarPath = pathsConfig.app.accountVillaCalendar.replace(
    '[account]',
    account,
  );
  const expensesPath = pathsConfig.app.accountVillaExpenses.replace(
    '[account]',
    account,
  );

  return (
    <Card className="bg-card" data-test={'villa-dashboard-setup'}>
      <CardHeader>
        <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-full">
          <Home className="h-5 w-5" />
        </div>

        <CardTitle>
          <Trans i18nKey={'villa.dashboard.setupTitle'} />
        </CardTitle>

        <CardDescription>
          <Trans
            i18nKey={
              role === 'villa_admin'
                ? 'villa.dashboard.setupDescriptionOwner'
                : 'villa.dashboard.setupDescriptionManager'
            }
          />
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={calendarPath} />}
            data-test={'villa-dashboard-quick-calendar'}
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            <Trans i18nKey={'villa.dashboard.calendar'} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={expensesPath} />}
            data-test={'villa-dashboard-quick-expense'}
          >
            <Receipt className="mr-1.5 h-3.5 w-3.5" />
            <Trans i18nKey={'villa.dashboard.addExpense'} />
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            <Trans i18nKey={'villa.dashboard.signedInAs'} />{' '}
            <span
              className="text-foreground font-medium"
              data-test={'villa-dashboard-role'}
            >
              <Trans i18nKey={`common.roles.${role}.label`} />
            </span>
          </p>

          {role === 'villa_admin' ? (
            <Button
              className="w-full sm:w-auto"
              size="sm"
              data-test={'villa-dashboard-invite-manager'}
              nativeButton={false}
              render={<Link href={membersPath} />}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              <Trans i18nKey={'villa.dashboard.inviteManager'} />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
