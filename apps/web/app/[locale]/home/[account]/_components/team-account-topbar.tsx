'use client';

import { usePathname, useRouter } from 'next/navigation';

import { ChevronDown, LogOut, Menu } from 'lucide-react';

import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { Button } from '@kit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { useSidebar } from '@kit/ui/sidebar';
import { Trans } from '@kit/ui/trans';

import type { AccountModel } from '~/components/workspace-dropdown';
import featureFlagsConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';
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
  accounts: AccountModel[];
  user: { email?: string | null } | null;
}) {
  const labelKey = useCurrentNavLabel(props.account);
  const { data: personalAccount } = usePersonalAccountData(props.userId);
  const signOutMutation = useSignOut();

  const displayName = personalAccount?.name ?? '';
  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';
  const { toggleSidebar } = useSidebar();

  return (
    <div className="bg-background sticky top-0 z-40 flex h-14 flex-shrink-0 items-center justify-between border-b px-4">
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="outline"
          size="icon-sm"
          className="border-border bg-background shrink-0 lg:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
        <span className="hidden truncate text-sm font-bold tracking-tight lg:block">
          <Trans i18nKey={labelKey} />
        </span>
      </div>

      <div className="flex items-center gap-3">
        <AssociationSwitcher
          accounts={props.accounts}
          selectedAccount={props.account}
        />

        {featureFlagsConfig.enableNotifications ? (
          <TeamAccountNotifications
            userId={props.userId}
            accountId={props.accountId}
          />
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="bg-primary text-primary-foreground focus:ring-primary/50 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-black transition-transform hover:scale-105 focus:ring-2 focus:outline-none"
                title={`Account options (${displayName})`}
              >
                {initials}
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex flex-col px-2 py-1.5 text-left">
              <span className="text-foreground truncate text-sm leading-none font-semibold">
                {displayName}
              </span>
              <span className="text-muted-foreground mt-1 truncate text-xs leading-none">
                {props.user?.email}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive flex cursor-pointer items-center gap-2 text-xs"
              disabled={signOutMutation.isPending}
              onClick={() => signOutMutation.mutate()}
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AssociationSwitcher(props: {
  accounts: AccountModel[];
  selectedAccount: string;
}) {
  const router = useRouter();
  const currentTeam = props.accounts.find(
    (a) => a.value === props.selectedAccount,
  );
  const currentLabel = currentTeam?.label ?? props.selectedAccount;
  const initials = currentLabel
    ? currentLabel
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '';

  const switchToTeam = (slug: string) => {
    router.replace(pathsConfig.app.accountHome.replace('[account]', slug));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-background text-foreground hover:bg-accent flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold shadow-sm"
          >
            <div className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded text-[9px] font-black">
              {initials}
            </div>
            <span className="max-w-[90px] truncate sm:max-w-[140px]" title={currentLabel}>
              {currentLabel}
            </span>
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-48">
        {props.accounts.map((acc) => {
          const accLabel = acc.label ?? '';
          const accInitials = accLabel
            ? accLabel
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            : '';
          return (
            <DropdownMenuItem
              key={acc.value}
              onClick={() => acc.value && switchToTeam(acc.value)}
              className={`flex cursor-pointer items-center gap-2 text-xs ${
                acc.value === props.selectedAccount ? 'bg-muted font-bold' : ''
              }`}
            >
              <div className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded text-[9px] font-black">
                {accInitials}
              </div>
              <span>{accLabel}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
