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
  user: any;
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
      <div className="flex min-w-0 items-center gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 lg:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
        <span className="truncate text-sm font-bold tracking-tight">
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
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f59e0b] text-xs font-black text-slate-950 transition-transform hover:scale-105 focus:ring-2 focus:ring-[#f59e0b]/50 focus:outline-none"
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
            className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded bg-[#f59e0b] text-[9px] font-black text-slate-950">
              {initials}
            </div>
            <span className="max-w-[140px] truncate">{currentLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
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
                acc.value === props.selectedAccount
                  ? 'bg-slate-100 font-bold dark:bg-slate-800'
                  : ''
              }`}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded bg-[#f59e0b] text-[9px] font-black text-slate-950">
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
