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

import {
  MobileNavDropdownLink,
  MobileNavSignOutItem,
} from '~/components/mobile-navigation-shared';

export function AdminMobileNavigation() {
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
