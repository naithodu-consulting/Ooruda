'use client';

import Link from 'next/link';

import { LogOut, Menu, Send, Users } from 'lucide-react';

import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { useUser } from '@kit/supabase/hooks/use-user';
import { Button } from '@kit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { useSidebar } from '@kit/ui/sidebar';

import { OorudaMark } from '~/components/ooruda-mark';

export function AdminTopbar() {
  const { toggleSidebar } = useSidebar();
  const signOutMutation = useSignOut();
  const user = useUser();
  const { data: personalAccountData } = usePersonalAccountData(
    user.data?.id ?? '',
  );

  const displayName = personalAccountData?.name ?? user.data?.email ?? '';
  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'SA';

  return (
    <div className="bg-background sticky top-0 z-40 flex h-14 flex-shrink-0 items-center justify-between border-b px-4">
      {/* Left side */}
      <div className="flex items-center gap-3">
        {/* Mobile: ooruda mark logo */}
        <Link
          href="/admin"
          className="flex items-center gap-2 lg:hidden"
          aria-label="Admin home"
        >
          <OorudaMark size={24} className="text-[#1a1a1a]" />
          <span className="text-[15px] font-black tracking-tight text-[#1a1a1a] lowercase">
            ooruda
          </span>
        </Link>

        {/* Desktop: sidebar collapse toggle + page label */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden shrink-0 lg:flex"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
        <span className="hidden text-sm font-bold tracking-tight lg:block">
          Super Admin
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Mobile: hamburger nav dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="text-foreground hover:bg-accent flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors lg:hidden"
                aria-label="Navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-screen rounded-none">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Super Admin</DropdownMenuLabel>
              <DropdownMenuItem
                render={
                  <Link
                    href="/admin/accounts"
                    className="flex h-12 w-full items-center gap-3"
                  >
                    <Users className="h-4 w-4" />
                    <span>Accounts</span>
                  </Link>
                }
              />
              {process.env.NEXT_PUBLIC_ENABLE_BILL_DISPATCH === 'true' && (
                <DropdownMenuItem
                  render={
                    <Link
                      href="/admin/bill-dispatch"
                      className="flex h-12 w-full items-center gap-3"
                    >
                      <Send className="h-4 w-4" />
                      <span>Bill Dispatch</span>
                    </Link>
                  }
                />
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive flex h-12 cursor-pointer items-center gap-3"
              disabled={signOutMutation.isPending}
              onClick={() => signOutMutation.mutate()}
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Desktop: user initials → sign-out dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f59e0b] text-xs font-black text-slate-950 transition-transform hover:scale-105 focus:ring-2 focus:ring-[#f59e0b]/50 focus:outline-none lg:flex"
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
                {user.data?.email}
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
