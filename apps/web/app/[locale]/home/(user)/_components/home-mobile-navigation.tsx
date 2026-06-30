'use client';

import { useState, useEffect } from 'react';

import { usePathname } from 'next/navigation';

import { Menu } from 'lucide-react';

import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { If } from '@kit/ui/if';
import { Trans } from '@kit/ui/trans';

import {
  MobileNavRouteLinks,
  MobileNavSignOutItem,
} from '~/components/mobile-navigation-shared';
import featuresFlagConfig from '~/config/feature-flags.config';
import { personalAccountNavigationConfig } from '~/config/personal-account-navigation.config';

// home imports
import { HomeAccountSelector } from '../_components/home-account-selector';
import type { UserWorkspace } from '../_lib/server/load-user-workspace';

export function HomeMobileNavigation(props: { workspace: UserWorkspace }) {
  const pathname = usePathname();
  const signOut = useSignOut();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger>
        <Menu className={'h-9'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent sideOffset={10} className={'w-screen rounded-none'}>
        <If condition={featuresFlagConfig.enableTeamAccounts}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <Trans i18nKey={'common.yourAccounts'} />
            </DropdownMenuLabel>

            <HomeAccountSelector
              collapsed={false}
              userId={props.workspace.user.id}
              accounts={props.workspace.accounts}
            />
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
        </If>

        <DropdownMenuGroup>
          <MobileNavRouteLinks
            routes={personalAccountNavigationConfig.routes}
          />
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <MobileNavSignOutItem onSignOut={() => signOut.mutateAsync()} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
