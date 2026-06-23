'use client';

import { usePathname } from 'next/navigation';

import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { Badge } from '@kit/ui/badge';
import { ProfileAvatar } from '@kit/ui/profile-avatar';
import { Trans } from '@kit/ui/trans';

import featureFlagsConfig from '~/config/feature-flags.config';
import { getTeamAccountSidebarConfig } from '~/config/team-account-navigation.config';

import { TeamAccountNotifications } from './team-account-notifications';

function useCurrentNavLabel(account: string): string {
  const pathname = usePathname();
  const config = getTeamAccountSidebarConfig(account);

  let bestMatch: { label: string; path: string } | null = null;

  for (const group of config.routes) {
    if (!('children' in group)) continue;

    for (const item of group.children) {
      if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
        if (!bestMatch || item.path.length > bestMatch.path.length) {
          bestMatch = { label: item.label, path: item.path };
        }
      }
    }
  }

  return bestMatch?.label ?? 'association.nav.dashboard';
}

export function TeamAccountTopbar(props: {
  account: string;
  accountId: string;
  userId: string;
  role: string | null;
}) {
  const labelKey = useCurrentNavLabel(props.account);
  const { data: personalAccount } = usePersonalAccountData(props.userId);

  const displayName = personalAccount?.name ?? null;

  return (
    <div className="bg-background hidden h-14 flex-shrink-0 items-center justify-between border-b px-4 lg:flex">
      <span className="text-sm font-bold tracking-tight">
        <Trans i18nKey={labelKey} />
      </span>

      <div className="flex items-center gap-3">
        {props.role ? (
          <Badge variant="secondary" className="font-medium">
            <Trans
              i18nKey={`association.roles.${props.role}`}
              defaults={props.role}
            />
          </Badge>
        ) : null}

        {featureFlagsConfig.enableNotifications ? (
          <TeamAccountNotifications
            userId={props.userId}
            accountId={props.accountId}
          />
        ) : null}

        <ProfileAvatar
          displayName={displayName ?? '?'}
          pictureUrl={personalAccount?.picture_url}
          className="size-8"
        />
      </div>
    </div>
  );
}
