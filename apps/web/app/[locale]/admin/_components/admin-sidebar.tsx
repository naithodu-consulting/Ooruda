'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LayoutDashboard, LogOut, Users } from 'lucide-react';

import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { useUser } from '@kit/supabase/hooks/use-user';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  useSidebar,
} from '@kit/ui/sidebar';

import { OorudaMark } from '~/components/ooruda-mark';

export function AdminSidebar() {
  const path = usePathname();
  const { open: isSidebarOpen, isMobile } = useSidebar();
  const signOutMutation = useSignOut();
  const user = useUser();
  const { data: personalAccountData } = usePersonalAccountData(
    user.data?.id ?? '',
  );

  const collapsed = !isSidebarOpen && !isMobile;

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
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className="h-16 justify-center px-3">
        <Link
          href="/admin"
          className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
        >
          <OorudaMark size={28} className="shrink-0 text-[#1a1a1a]" />
          <span className="text-[15px] font-black tracking-tight text-[#1a1a1a] lowercase group-data-[collapsible=icon]:hidden">
            ooruda
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Super Admin</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuButton
                isActive={path === '/admin'}
                render={<Link className={'flex gap-2.5'} href={'/admin'} />}
              >
                <LayoutDashboard className={'h-4'} />
                <span>Dashboard</span>
              </SidebarMenuButton>

              <SidebarMenuButton
                isActive={path.includes('/admin/accounts')}
                render={
                  <Link
                    className={'flex size-full gap-2.5'}
                    href={'/admin/accounts'}
                  >
                    <Users className={'h-4'} />
                    <span>Accounts</span>
                  </Link>
                }
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[#1F2D3D] bg-[#050B14] p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              collapsed ? (
                <button
                  type="button"
                  className="animate-in fade-in zoom-in-95 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f59e0b] p-0 text-sm font-black text-slate-950 duration-200 focus:ring-2 focus:ring-[#f59e0b]/50 focus:outline-none"
                  title={`Account options (${displayName})`}
                >
                  {initials}
                </button>
              ) : (
                <button
                  type="button"
                  className="animate-in fade-in slide-in-from-bottom-2 flex w-full cursor-pointer items-center justify-between gap-3 text-left duration-200 focus:outline-none"
                  title="Account options"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-sm font-black text-slate-950">
                      {initials}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-xs leading-snug font-bold text-white">
                        {displayName}
                      </span>
                      <span className="truncate text-[10px] font-semibold text-slate-400">
                        Super Admin
                      </span>
                    </div>
                  </div>
                </button>
              )
            }
          />
          <DropdownMenuContent
            align={collapsed ? 'center' : 'end'}
            side={collapsed ? 'right' : 'top'}
            className="w-56"
          >
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
      </SidebarFooter>
    </Sidebar>
  );
}
