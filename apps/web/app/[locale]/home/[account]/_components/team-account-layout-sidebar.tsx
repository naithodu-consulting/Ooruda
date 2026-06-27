'use client';

import { JWTUserData } from '@kit/supabase/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@kit/ui/sidebar';
import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { LogOut } from 'lucide-react';
import { Button } from '@kit/ui/button';

import type { AccountModel } from '~/components/workspace-dropdown';
import {
  filterSidebarConfigByRole,
  getTeamAccountSidebarConfig,
} from '~/config/team-account-navigation.config';

import { TeamAccountLayoutSidebarNavigation } from './team-account-layout-sidebar-navigation';
import { TeamAccountSidebarBrand } from './team-account-sidebar-brand';

export function TeamAccountLayoutSidebar(props: {
  account: string;
  accountId: string;
  accounts: AccountModel[];
  user: JWTUserData;
  role: string | null;
}) {
  const { account, user, role } = props;
  const { open: isSidebarOpen, isMobile } = useSidebar();
  const signOutMutation = useSignOut();
  const { data: personalAccountData } = usePersonalAccountData(user.id);

  const config = filterSidebarConfigByRole(
    getTeamAccountSidebarConfig(account),
    role,
  );
  const collapsible = config.sidebarCollapsedStyle;
  const collapsed = !isSidebarOpen && !isMobile;

  const displayName = personalAccountData?.name ?? user.email ?? '';
  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  let roleLabel = '';
  if (role === 'assoc_admin') {
    roleLabel = 'Assoc. admin';
  } else if (role === 'prop_owner') {
    roleLabel = 'Property Owner';
  } else if (role === 'tenant') {
    roleLabel = 'Tenant';
  } else if (role === 'billing_operator') {
    roleLabel = 'Billing Operator';
  } else {
    roleLabel = role ?? '';
  }

  return (
    <Sidebar variant="floating" collapsible={collapsible}>
      <SidebarHeader className={'h-16 justify-center'}>
        <TeamAccountSidebarBrand />
      </SidebarHeader>

      <SidebarContent className="h-[calc(100%-160px)] overflow-y-auto">
        <TeamAccountLayoutSidebarNavigation config={config} />
      </SidebarContent>

      <SidebarFooter className="border-t border-[#1F2D3D] p-4 bg-[#050B14]">
        {collapsed ? (
          <div className="flex items-center justify-center">
            <Button
              variant="ghost"
              className="p-0 h-9 w-9 rounded-full bg-[#f59e0b] text-sm font-black text-slate-950 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200"
              disabled={signOutMutation.isPending}
              onClick={() => signOutMutation.mutate()}
              title={`Sign Out (${displayName})`}
            >
              {initials}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-3 min-w-0">
              {/* Initials Circle */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-sm font-black text-slate-950">
                {initials}
              </div>
              {/* User Info */}
              <div className="flex flex-col min-w-0">
                <span className="truncate text-xs font-bold text-white leading-snug">
                  {displayName}
                </span>
                <span className="truncate text-[10px] font-semibold text-slate-400">
                  {roleLabel}
                </span>
              </div>
            </div>
            {/* Sign Out Button */}
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white hover:bg-white/10 h-8 w-8 rounded-lg transition-colors shrink-0"
              disabled={signOutMutation.isPending}
              onClick={() => signOutMutation.mutate()}
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
