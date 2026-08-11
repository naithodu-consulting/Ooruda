'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Activity, Bell, Send, Users } from 'lucide-react';

import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { useUser } from '@kit/supabase/hooks/use-user';
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

      <SidebarContent className="no-scrollbar">
        <SidebarGroup>
          <SidebarGroupLabel>Super Admin</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuButton
                isActive={path.includes('/admin/accounts')}
                render={
                  <Link
                    className={'flex size-full gap-2.5'}
                    href={'/admin/accounts'}
                  >
                    <Users className={'h-4 w-4 shrink-0'} />
                    <span>Accounts</span>
                  </Link>
                }
              />

              {process.env.NEXT_PUBLIC_ENABLE_SMS_EMAIL_NOTIFICATIONS ===
                'true' && (
                <SidebarMenuButton
                  isActive={path.includes('/admin/channels')}
                  render={
                    <Link
                      className={'flex size-full gap-2.5'}
                      href={'/admin/channels'}
                    >
                      <Bell className={'h-4 w-4 shrink-0'} />
                      <span>Channels</span>
                    </Link>
                  }
                />
              )}

              <SidebarMenuButton
                isActive={path.includes('/admin/activity')}
                render={
                  <Link
                    className={'flex size-full gap-2.5'}
                    href={'/admin/activity'}
                  >
                    <Activity className={'h-4 w-4 shrink-0'} />
                    <span>Activity Log</span>
                  </Link>
                }
              />

              {process.env.NEXT_PUBLIC_ENABLE_BILL_DISPATCH === 'true' && (
                <SidebarMenuButton
                  isActive={path.includes('/admin/bill-dispatch')}
                  render={
                    <Link
                      className={'flex size-full gap-2.5'}
                      href={'/admin/bill-dispatch'}
                    >
                      <Send className={'h-4 w-4 shrink-0'} />
                      <span>Bill Dispatch</span>
                    </Link>
                  }
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[#1F2D3D] bg-[#050B14] px-3 py-3">
        {collapsed ? (
          <div className="flex items-center justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f59e0b] text-sm font-black text-slate-950">
              {initials}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-3 duration-200">
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
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
