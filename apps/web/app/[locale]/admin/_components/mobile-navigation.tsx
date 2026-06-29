'use client';

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

import {
  MobileNavDropdownLink,
  MobileNavSignOutItem,
} from '~/components/mobile-navigation-shared';

export function AdminMobileNavigation() {
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Menu className={'h-9'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent className={'w-screen rounded-none'}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Super Admin</DropdownMenuLabel>

          <MobileNavDropdownLink path={'/admin'} label={'Dashboard'} />

          <MobileNavDropdownLink path={'/admin/accounts'} label={'Accounts'} />
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <MobileNavSignOutItem onSignOut={() => signOut.mutateAsync()} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
