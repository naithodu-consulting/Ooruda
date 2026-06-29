'use client';

import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { JWTUserData } from '@kit/supabase/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@kit/ui/sidebar';

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

      <SidebarContent className="no-scrollbar">
        <TeamAccountLayoutSidebarNavigation config={config} />
      </SidebarContent>

      <SidebarFooter className="border-t border-[#1F2D3D] bg-[#050B14] px-3 py-3">
        {collapsed ? (
          <div className="flex items-center justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f59e0b] text-sm font-black text-slate-950">
              {initials}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center justify-between gap-3 duration-200">
            <div className="flex min-w-0 items-center gap-3">
              {/* Initials Circle */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-sm font-black text-slate-950">
                {initials}
              </div>
              {/* User Info */}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs leading-snug font-bold text-white">
                  {displayName}
                </span>
                <span className="truncate text-[10px] font-semibold text-slate-400">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
